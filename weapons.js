import * as THREE from 'https://csc-vu.github.io/lib/three.module.js';

const BULLET_RADIUS = 0.03;
const BULLET_LENGTH = 0.5;

const bulletGeometry = new THREE.CylinderGeometry(BULLET_RADIUS,BULLET_RADIUS,BULLET_LENGTH,8);
const bulletMaterial = new THREE.MeshStandardMaterial({color:"#ffff00", roughness: 0.3});

bulletGeometry.rotateX(Math.PI / 2);

export function createBulletMesh() {
  const mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
  return mesh;
}

class Bullet {
  constructor(origin, direction, speed = 30, maxDistance = 100) {
    // Mesh
    this.mesh = new THREE.Mesh(bulletGeometry, bulletMaterial);
    this.mesh.position.copy(origin);

    // Ensure direction is normalized
    this.direction = direction.clone().normalize();

    // Align the cylinder so its +Z axis matches direction
    // (if we rotated the geometry to point along +Z)
    const forward = new THREE.Vector3(0, 0, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(forward, this.direction);
    this.mesh.quaternion.copy(quat);

    // Movement parameters
    this.speed = speed;             // units per second
    this.travelled = 0;             // distance travelled so far
    this.maxDistance = maxDistance; // despawn after this

    // For collision, we want previous position for swept tests
    this.prevPos = origin.clone();
  }

  update(delta) {
    this.prevPos.copy(this.mesh.position);

    const step = this.speed * delta;
    this.mesh.position.addScaledVector(this.direction, step);
    this.travelled += step;
  }

  isExpired() {
    return this.travelled >= this.maxDistance;
  }
}

export { Bullet };
