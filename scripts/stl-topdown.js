#!/usr/bin/env node
// Renders public/*.stl and public/*.glb files as top-down PNGs (pure Node.js, no deps).
// Run: node scripts/stl-topdown.js
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ── STL parser ───────────────────────────────────────────────────────────────

function parseSTL(buffer) {
  const numTri = buffer.readUInt32LE(80);
  if (84 + numTri * 50 === buffer.length) return parseBinarySTL(buffer);
  const text = buffer.toString("utf8");
  if (text.trimStart().toLowerCase().startsWith("solid")) {
    const parsed = parseASCIISTL(text);
    if (parsed.length > 0) return parsed;
  }
  return parseBinarySTL(buffer);
}

function parseBinarySTL(buffer) {
  const n = buffer.readUInt32LE(80);
  const tris = [];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50;
    tris.push({
      normal: [buffer.readFloatLE(o), buffer.readFloatLE(o + 4), buffer.readFloatLE(o + 8)],
      v: [
        [buffer.readFloatLE(o + 12), buffer.readFloatLE(o + 16), buffer.readFloatLE(o + 20)],
        [buffer.readFloatLE(o + 24), buffer.readFloatLE(o + 28), buffer.readFloatLE(o + 32)],
        [buffer.readFloatLE(o + 36), buffer.readFloatLE(o + 40), buffer.readFloatLE(o + 44)],
      ],
    });
  }
  return tris;
}

function parseASCIISTL(text) {
  const tris = [];
  const re = /facet\s+normal\s+([\-\d.e+]+)\s+([\-\d.e+]+)\s+([\-\d.e+]+)[\s\S]*?vertex\s+([\-\d.e+]+)\s+([\-\d.e+]+)\s+([\-\d.e+]+)\s+vertex\s+([\-\d.e+]+)\s+([\-\d.e+]+)\s+([\-\d.e+]+)\s+vertex\s+([\-\d.e+]+)\s+([\-\d.e+]+)\s+([\-\d.e+]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null)
    tris.push({ normal: [+m[1],+m[2],+m[3]], v: [[+m[4],+m[5],+m[6]],[+m[7],+m[8],+m[9]],[+m[10],+m[11],+m[12]]] });
  return tris;
}

// ── GLB parser (with DRACO support) ─────────────────────────────────────────

function readGLBChunks(buffer) {
  if (buffer.readUInt32LE(0) !== 0x46546C67) throw new Error("Not a GLB file");
  let offset = 12, json = null, bin = null;
  while (offset < buffer.length) {
    const len  = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.slice(offset + 8, offset + 8 + len);
    offset += 8 + len;
    if (type === 0x4E4F534A) json = JSON.parse(data.toString("utf8"));
    else if (type === 0x004E4942) bin = data;
  }
  if (!json) throw new Error("No JSON chunk in GLB");
  return { json, bin };
}

async function parseGLB(buffer) {
  const { json, bin } = readGLBChunks(buffer);
  const tris = [];

  // Check if DRACO compression is needed
  const needsDraco = (json.extensionsRequired ?? []).includes("KHR_draco_mesh_compression");
  let dracoModule = null;
  if (needsDraco) {
    const draco3d = require("draco3d");
    dracoModule = await draco3d.createDecoderModule();
  }

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;

      let verts, indices;

      const dracoExt = prim.extensions?.KHR_draco_mesh_compression;
      if (dracoExt && dracoModule) {
        // Decode DRACO compressed primitive
        const bv = json.bufferViews[dracoExt.bufferView];
        const compressedData = bin.slice(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);

        const decoder = new dracoModule.Decoder();
        const buffer_ = new dracoModule.DecoderBuffer();
        buffer_.Init(new Int8Array(compressedData), compressedData.byteLength);
        const geomType = decoder.GetEncodedGeometryType(buffer_);
        const mesh_ = new dracoModule.Mesh();
        decoder.DecodeBufferToMesh(buffer_, mesh_);

        const numFaces = mesh_.num_faces();
        const numVerts = mesh_.num_points();

        // Extract positions
        const posAttId = decoder.GetAttributeId(mesh_, dracoModule.POSITION);
        const posAtt = decoder.GetAttribute(mesh_, posAttId);
        const posArr = new dracoModule.DracoFloat32Array();
        decoder.GetAttributeFloatForAllPoints(mesh_, posAtt, posArr);
        verts = [];
        for (let i = 0; i < numVerts; i++)
          verts.push([posArr.GetValue(i*3), posArr.GetValue(i*3+1), posArr.GetValue(i*3+2)]);
        dracoModule.destroy(posArr);

        // Extract indices
        const idxArr = new dracoModule.DracoInt32Array();
        indices = [];
        for (let f = 0; f < numFaces; f++) {
          decoder.GetFaceFromMesh(mesh_, f, idxArr);
          indices.push(idxArr.GetValue(0), idxArr.GetValue(1), idxArr.GetValue(2));
        }
        dracoModule.destroy(idxArr);
        dracoModule.destroy(mesh_);
        dracoModule.destroy(buffer_);
        dracoModule.destroy(decoder);
      } else {
        // Uncompressed primitive
        const posIdx = prim.attributes?.POSITION;
        if (posIdx === undefined) continue;
        const posAcc  = json.accessors[posIdx];
        const posView = json.bufferViews[posAcc.bufferView];
        const posOff  = (posView.byteOffset ?? 0) + (posAcc.byteOffset ?? 0);
        const stride  = posView.byteStride || 12;
        verts = [];
        for (let i = 0; i < posAcc.count; i++) {
          const b = posOff + i * stride;
          verts.push([bin.readFloatLE(b), bin.readFloatLE(b+4), bin.readFloatLE(b+8)]);
        }
        indices = [];
        if (prim.indices !== undefined) {
          const idxAcc  = json.accessors[prim.indices];
          const idxView = json.bufferViews[idxAcc.bufferView];
          const idxOff  = (idxView.byteOffset ?? 0) + (idxAcc.byteOffset ?? 0);
          const ct = idxAcc.componentType;
          for (let i = 0; i < idxAcc.count; i++) {
            const b = idxOff + i * (ct === 5125 ? 4 : ct === 5123 ? 2 : 1);
            indices.push(ct === 5125 ? bin.readUInt32LE(b) : ct === 5123 ? bin.readUInt16LE(b) : bin.readUInt8(b));
          }
        } else {
          indices = verts.map((_, i) => i);
        }
      }

      for (let i = 0; i + 2 < indices.length; i += 3) {
        const v0=verts[indices[i]], v1=verts[indices[i+1]], v2=verts[indices[i+2]];
        const ax=v1[0]-v0[0], ay=v1[1]-v0[1], az=v1[2]-v0[2];
        const bx=v2[0]-v0[0], by=v2[1]-v0[1], bz=v2[2]-v0[2];
        tris.push({ normal:[ay*bz-az*by, az*bx-ax*bz, ax*by-ay*bx], v:[v0,v1,v2] });
      }
    }
  }
  return tris;
}

// ── Axis mapping ─────────────────────────────────────────────────────────────

// STL models (Z-up, depth=X, width=Y):  swap X↔Y so width is horizontal.
function stlAxes(v)  { return [v[1], v[0], v[2]]; }

// GLB model (Z-up):  project onto XY plane (top-down = look down -Z).
function glbAxes(v)  { return [v[0], v[1], v[2]]; }

// ── Renderer ─────────────────────────────────────────────────────────────────

function renderTopDown(triangles, toScreen) {
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
  for (const t of triangles) for (const raw of t.v) {
    const v = toScreen(raw);
    if (v[0]<minX) minX=v[0]; if (v[0]>maxX) maxX=v[0];
    if (v[1]<minY) minY=v[1]; if (v[1]>maxY) maxY=v[1];
    if (v[2]<minZ) minZ=v[2]; if (v[2]>maxZ) maxZ=v[2];
  }
  const rangeZ = maxZ - minZ || 1;

  // Output size: long side = 1024px, aspect ratio from bounding box
  const spanX = (maxX-minX) || 1, spanY = (maxY-minY) || 1;
  const pad = 0.06;
  const pMinX = minX - spanX*pad, pMaxX = maxX + spanX*pad;
  const pMinY = minY - spanY*pad, pMaxY = maxY + spanY*pad;
  const pSpanX = pMaxX-pMinX, pSpanY = pMaxY-pMinY;

  const LONG = 1024;
  const imgW = pSpanX >= pSpanY ? LONG : Math.round(LONG * pSpanX / pSpanY);
  const imgH = pSpanY >= pSpanX ? LONG : Math.round(LONG * pSpanY / pSpanX);

  const scale = Math.min(imgW/pSpanX, imgH/pSpanY);
  const offX = (imgW - pSpanX*scale) / 2;
  const offY = (imgH - pSpanY*scale) / 2;
  const sx = wx => (wx - pMinX)*scale + offX;
  const sy = wy => imgH - 1 - ((wy - pMinY)*scale + offY);

  const pixels = new Uint8Array(imgW * imgH * 3).fill(242);
  const zbuf   = new Float32Array(imgW * imgH).fill(-Infinity);

  for (const tri of triangles) {
    const [ra, rb, rc] = tri.v;
    const a=toScreen(ra), b=toScreen(rb), c=toScreen(rc);
    const ax=sx(a[0]), ay=sy(a[1]);
    const bx=sx(b[0]), by=sy(b[1]);
    const cx=sx(c[0]), cy=sy(c[1]);

    const [nx, ny, nz] = normalizeVec(...tri.normal);
    const diffuse = Math.max(0, nz);
    const fill    = Math.max(0, 0.5*ny + 0.5*nz);
    let bright = 0.25 + 0.65*diffuse + 0.1*fill;
    bright = Math.max(0.15, Math.min(1.0, bright));

    const bbMinX = Math.max(0, Math.floor(Math.min(ax,bx,cx)));
    const bbMaxX = Math.min(imgW-1, Math.ceil(Math.max(ax,bx,cx)));
    const bbMinY = Math.max(0, Math.floor(Math.min(ay,by,cy)));
    const bbMaxY = Math.min(imgH-1, Math.ceil(Math.max(ay,by,cy)));

    const denom = (by-cy)*(ax-cx) + (cx-bx)*(ay-cy);
    if (Math.abs(denom) < 1e-8) continue;

    for (let py=bbMinY; py<=bbMaxY; py++) {
      for (let px=bbMinX; px<=bbMaxX; px++) {
        const w0 = ((by-cy)*(px-cx) + (cx-bx)*(py-cy)) / denom;
        const w1 = ((cy-ay)*(px-cx) + (ax-cx)*(py-cy)) / denom;
        const w2 = 1-w0-w1;
        if (w0<-1e-5 || w1<-1e-5 || w2<-1e-5) continue;

        const z = w0*a[2] + w1*b[2] + w2*c[2];
        const idx = py*imgW + px;
        if (z <= zbuf[idx]) continue;
        zbuf[idx] = z;

        const dep = (z-minZ)/rangeZ;
        const f = bright * (0.85 + 0.15*dep);
        pixels[idx*3]   = Math.min(255, Math.round(207*f));
        pixels[idx*3+1] = Math.min(255, Math.round(214*f));
        pixels[idx*3+2] = Math.min(255, Math.round(223*f));
      }
    }
  }
  return { pixels, imgW, imgH };
}

function normalizeVec(x, y, z) {
  const len = Math.sqrt(x*x+y*y+z*z) || 1;
  return [x/len, y/len, z/len];
}

// ── PNG writer ───────────────────────────────────────────────────────────────

function writePNG(pixels, w, h, outPath) {
  const raw = Buffer.alloc((w*3+1)*h);
  for (let y=0; y<h; y++) {
    raw[y*(w*3+1)] = 0;
    for (let x=0; x<w; x++) {
      const s=(y*w+x)*3, d=y*(w*3+1)+1+x*3;
      raw[d]=pixels[s]; raw[d+1]=pixels[s+1]; raw[d+2]=pixels[s+2];
    }
  }
  const compressed = zlib.deflateSync(raw, { level: 6 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w,0); ihdr.writeUInt32BE(h,4);
  ihdr[8]=8; ihdr[9]=2;
  fs.writeFileSync(outPath, Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0)),
  ]));
}

function chunk(type, data) {
  const t=Buffer.from(type,"ascii"), l=Buffer.alloc(4), c=Buffer.alloc(4);
  l.writeUInt32BE(data.length);
  c.writeUInt32BE(crc32(Buffer.concat([t,data])));
  return Buffer.concat([l,t,data,c]);
}

const CRC_TABLE = (() => {
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}
  return t;
})();
function crc32(buf) {
  let c=0xffffffff;
  for(let i=0;i<buf.length;i++) c=CRC_TABLE[(c^buf[i])&0xff]^(c>>>8);
  return (c^0xffffffff)>>>0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  const publicDir = path.join(__dirname, "..", "public");
  const files = fs.readdirSync(publicDir).filter(f => /\.(stl|glb)$/i.test(f));

  if (files.length === 0) { console.error("No .stl or .glb files found in public/"); process.exit(1); }

  for (const file of files) {
    const inPath  = path.join(publicDir, file);
    const outName = file.replace(/\.(stl|glb)$/i, "-top.png");
    const outPath = path.join(publicDir, outName);

    process.stdout.write(`Rendering ${file} … `);
    try {
      const buf = fs.readFileSync(inPath);
      const isGLB = /\.glb$/i.test(file);
      const triangles = isGLB ? await parseGLB(buf) : parseSTL(buf);
      const toScreen  = isGLB ? glbAxes : stlAxes;
      process.stdout.write(`${triangles.length} triangles … `);
      const { pixels, imgW, imgH } = renderTopDown(triangles, toScreen);
      writePNG(pixels, imgW, imgH, outPath);
      console.log(`${imgW}×${imgH} → public/${outName}`);
    } catch (e) {
      console.error(`ERROR: ${e.message}`);
    }
  }
})();
