import React, { useRef, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import playerState from './playerState';
import hunterState from './hunterState';

const OFFSET = new THREE.Vector3(15, 15, 15);
const DEFAULT_ZOOM = 12;
const THREAT_ZOOM = 10; // wider view frustum under threat

export default function CameraRig() {
  const cameraRef = useRef();
  
  const initial = playerState.position;
  const lookAtTarget = useRef(new THREE.Vector3(initial.x, initial.y, initial.z));
  const desiredPos = useRef(new THREE.Vector3());
  const cameraStartPos = [initial.x + OFFSET.x, initial.y + OFFSET.y, initial.z + OFFSET.z];

  useLayoutEffect(() => {
    if (cameraRef.current) {
      cameraRef.current.position.set(...cameraStartPos);
      lookAtTarget.current.set(initial.x, initial.y, initial.z);
      cameraRef.current.lookAt(lookAtTarget.current);
    }
  }, []);

  useFrame((state, delta) => {
    if (!cameraRef.current) return;

    // Get current player position
    const { x, y, z } = playerState.position;
    
    // Lerp lookAt target towards player position (responsive tracking)
    desiredPos.current.set(x, y, z);
    lookAtTarget.current.lerp(desiredPos.current, delta * 10);
    
    // Lerp camera position towards player position + offset
    desiredPos.current.set(x + OFFSET.x, y + OFFSET.y, z + OFFSET.z);
    cameraRef.current.position.lerp(desiredPos.current, delta * 10);
    
    // Update camera rotation to point at the interpolated target
    cameraRef.current.lookAt(lookAtTarget.current);

    // ---- Dynamic Zoom: wider framing when 2+ Hunters are nearby ----
    const nearbyCount = hunterState.getNearbyHunterCount(playerState.position, 15);
    const targetZoom = nearbyCount >= 2 ? THREAT_ZOOM : DEFAULT_ZOOM;
    
    if (Math.abs(cameraRef.current.zoom - targetZoom) > 0.01) {
      cameraRef.current.zoom = THREE.MathUtils.lerp(cameraRef.current.zoom, targetZoom, delta * 4);
      cameraRef.current.updateProjectionMatrix();
    }
  });

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      position={cameraStartPos}
      zoom={12}
      left={-38}
      right={38}
      top={38}
      bottom={-38}
      near={0.1}
      far={200}
    />
  );
}
