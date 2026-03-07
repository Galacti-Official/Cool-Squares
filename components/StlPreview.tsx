"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type StlPreviewProps = {
  modelPath: string;
  zoom?: number;
  className?: string;
  rotationPeriodMs?: number;
};

export default function StlPreview({
  modelPath,
  zoom = 1,
  className = "h-full w-full",
  rotationPeriodMs = 17500,
}: StlPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 2.2, 4.2);
    camera.lookAt(0, 0.4, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(3, 4, 3);
    const rimLight = new THREE.DirectionalLight(0xbfd3ff, 0.45);
    rimLight.position.set(-3, 2, -2);
    scene.add(ambientLight, keyLight, rimLight);

    const loader = new STLLoader();
    let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
    const rotationSpeedRadPerSec = (Math.PI * 2) / (rotationPeriodMs / 1000);

    const fitCameraToMesh = () => {
      if (!mesh) return;
      const box = new THREE.Box3().setFromObject(mesh);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) / 2;
      const vFov = THREE.MathUtils.degToRad(camera.fov);
      const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
      const limitingFov = Math.min(vFov, hFov);
      const fitDistance = (radius / Math.tan(limitingFov / 2)) * 1.3;
      const distance = fitDistance / Math.max(zoom, 0.1);

      camera.position.set(center.x, center.y + radius * 0.25, center.z + distance);
      camera.near = Math.max(0.01, distance / 100);
      camera.far = Math.max(100, distance * 100);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
    };

    loader.load(modelPath, (geometry) => {
      geometry.center();
      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: "#cfd6df",
        metalness: 0.25,
        roughness: 0.35,
      });

      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.35;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3()).length();
      const scale = size > 0 ? 3.9 / size : 1;
      mesh.scale.setScalar(scale);

      scene.add(mesh);
      fitCameraToMesh();
    });

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      renderer.setSize(width, height);
      camera.aspect = width / height;
      fitCameraToMesh();
    };

    resize();
    window.addEventListener("resize", resize);

    let frameId = 0;
    let lastFrameTs: number | null = null;
    const renderLoop = (timestamp: number) => {
      if (lastFrameTs === null) {
        lastFrameTs = timestamp;
      }
      const deltaSec = (timestamp - lastFrameTs) / 1000;
      lastFrameTs = timestamp;

      if (mesh) {
        mesh.rotation.z += rotationSpeedRadPerSec * deltaSec;
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderLoop);
    };

    frameId = window.requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frameId);

      if (mesh) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }

      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [modelPath, zoom, rotationPeriodMs]);

  return (
    <div
      ref={containerRef}
      className={className}
      aria-label="3D STL preview"
    />
  );
}
