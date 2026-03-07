"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

type StlPreviewProps = {
  modelPath: string;
};

export default function StlPreview({ modelPath }: StlPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    camera.position.set(0, 1.5, 5);
    camera.lookAt(0, 0, 0);

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
    let mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | null = null;

    const fitCameraToMesh = () => {
      if (!mesh) return;
      const box = new THREE.Box3().setFromObject(mesh);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(sphere.radius, 0.001);
      const fov = THREE.MathUtils.degToRad(camera.fov);
      const distV = radius / Math.tan(fov / 2);
      const distH = radius / (Math.tan(fov / 2) * camera.aspect);
      const distance = Math.max(distV, distH) * 1.25;

      camera.position.set(0, radius * 0.15, distance);
      camera.near = Math.max(0.01, distance / 250);
      camera.far = distance + radius * 50;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    };

    loader.load(modelPath, (geometry) => {
      geometry.center();
      geometry.computeVertexNormals();

      const material = new THREE.MeshBasicMaterial({
        color: "#5da832",
      });

      mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0, 0);

      scene.add(mesh);
      fitCameraToMesh();
    });

    const resize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (!width || !height) return;

      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      fitCameraToMesh();
    };

    resize();
    window.addEventListener("resize", resize);

    let frameId = 0;
    const renderLoop = () => {
      if (mesh) {
        mesh.rotation.z += 0.006;
      }

      renderer.render(scene, camera);
      frameId = window.requestAnimationFrame(renderLoop);
    };

    renderLoop();

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
  }, [modelPath]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      aria-label="3D STL preview"
    />
  );
}
