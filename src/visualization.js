import * as THREE from 'three';
import TWEEN from 'three/addons/libs/tween.module.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { createPeopleCard } from './peopleCard.js';

const TRANSITION_DURATION = 2_000;
const CAMERA_TRANSITION_DURATION = 1_200;
const TABLE_COLUMNS = 20;
const TABLE_COLUMN_SPACING = 200;
const TABLE_ROW_SPACING = 290;
const CARD_WIDTH = 180;
const CARD_HEIGHT = 260;
export const DOUBLE_HELIX_LEVELS = 100;
export const DOUBLE_HELIX_TURNS = 3;
const DOUBLE_HELIX_RADIUS = 1_800;
const DOUBLE_HELIX_VERTICAL_SPACING = 45;
const GRID_COLUMNS = 10;
const GRID_ROWS = 4;
const GRID_DEPTHS = 5;
const GRID_COLUMN_SPACING = 460;
const GRID_ROW_SPACING = 330;
const GRID_DEPTH_SPACING = 850;
const CAMERA_DIRECTIONS = {
  table: new THREE.Vector3(0, 0, 1),
  sphere: new THREE.Vector3(0, 0, 1),
  helix: new THREE.Vector3(1.05, 0.12, 1),
  grid: new THREE.Vector3(0.82, 0.48, 1),
};

export function getTablePosition(index, count) {
  const column = index % TABLE_COLUMNS;
  const row = Math.floor(index / TABLE_COLUMNS);
  const rowCount = Math.ceil(count / TABLE_COLUMNS);

  return {
    x: (column - (TABLE_COLUMNS - 1) / 2) * TABLE_COLUMN_SPACING,
    y: -(row - (rowCount - 1) / 2) * TABLE_ROW_SPACING,
    z: 0,
  };
}

export function getDoubleHelixPosition(index, count) {
  const levels = Math.ceil(count / 2);
  const strand = index % 2;
  const level = Math.floor(index / 2);
  const angularStep = (DOUBLE_HELIX_TURNS * Math.PI * 2) / (levels - 1);
  const angle = level * angularStep + strand * Math.PI;
  const centerLevel = (levels - 1) / 2;

  return {
    x: DOUBLE_HELIX_RADIUS * Math.cos(angle),
    y: (centerLevel - level) * DOUBLE_HELIX_VERTICAL_SPACING,
    z: DOUBLE_HELIX_RADIUS * Math.sin(angle),
    angle,
    strand,
    level,
  };
}

export function getGridPosition(index) {
  const column = index % GRID_COLUMNS;
  const row = Math.floor(index / GRID_COLUMNS) % GRID_ROWS;
  const depth = Math.floor(index / (GRID_COLUMNS * GRID_ROWS));

  return {
    x: (column - (GRID_COLUMNS - 1) / 2) * GRID_COLUMN_SPACING,
    y: ((GRID_ROWS - 1) / 2 - row) * GRID_ROW_SPACING,
    z: (depth - (GRID_DEPTHS - 1) / 2) * GRID_DEPTH_SPACING,
  };
}

export function createLayoutTargets(count) {
  const targets = { table: [], sphere: [], helix: [], grid: [] };
  const vector = new THREE.Vector3();

  for (let index = 0; index < count; index += 1) {
    const tableTarget = new THREE.Object3D();
    tableTarget.position.copy(getTablePosition(index, count));
    targets.table.push(tableTarget);

    const sphereTarget = new THREE.Object3D();
    const phi = Math.acos(-1 + (2 * index) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    sphereTarget.position.setFromSphericalCoords(1_250, phi, theta);
    sphereTarget.lookAt(vector.copy(sphereTarget.position).multiplyScalar(2));
    targets.sphere.push(sphereTarget);

    const helixTarget = new THREE.Object3D();
    const helixPosition = getDoubleHelixPosition(index, count);
    helixTarget.position.set(helixPosition.x, helixPosition.y, helixPosition.z);
    vector.set(helixPosition.x * 2, helixPosition.y, helixPosition.z * 2);
    helixTarget.lookAt(vector);
    targets.helix.push(helixTarget);

    const gridTarget = new THREE.Object3D();
    gridTarget.position.copy(getGridPosition(index));
    targets.grid.push(gridTarget);
  }

  return targets;
}

export function getLayoutBounds(targets, padding = 260) {
  const bounds = new THREE.Box3();
  targets.forEach((target) => bounds.expandByPoint(target.position));
  bounds.min.addScalar(-padding);
  bounds.max.addScalar(padding);
  return bounds;
}

export function getCameraFrame(targets, fov, aspect, layout = 'table') {
  const bounds = getLayoutBounds(targets);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const verticalDistance = (size.y / 2) / Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const horizontalDistance = (size.x / 2) / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect);
  const depthFactor = layout === 'table' || layout === 'sphere' ? 1 : 1.25;
  const distance = (Math.max(verticalDistance, horizontalDistance) * 1.1 + size.z / 2) * depthFactor;
  const direction = (CAMERA_DIRECTIONS[layout] ?? CAMERA_DIRECTIONS.table).clone().normalize();

  return {
    position: center.clone().addScaledVector(direction, distance),
    target: center,
  };
}

export class PeopleVisualization {
  constructor(container, people) {
    this.container = container;
    this.people = people;
    this.objects = [];
    this.targets = createLayoutTargets(people.length);
    this.currentLayout = 'table';
    this.isDisposed = false;
    this.animationFrameId = null;
    this.resizeFrameId = null;
    this.prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 1, 25_000);
    this.scene = new THREE.Scene();

    this.renderer = new CSS3DRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.replaceChildren(this.renderer.domElement);

    this.controls = new TrackballControls(this.camera, this.renderer.domElement);
    this.controls.minDistance = 700;
    this.controls.maxDistance = 20_000;
    this.controls.addEventListener('change', this.render);

    this.createObjects();
    this.applyCameraFrame('table');
    window.addEventListener('resize', this.handleResize);
    this.transformTo('table', { frameCamera: false });
    this.animate();
  }

  createObjects() {
    this.people.forEach((person) => {
      const object = new CSS3DObject(createPeopleCard(person));
      object.position.set(
        Math.random() * 6_000 - 3_000,
        Math.random() * 6_000 - 3_000,
        Math.random() * 6_000 - 3_000,
      );
      this.scene.add(object);
      this.objects.push(object);
    });
  }

  getFrame(layout) {
    return getCameraFrame(this.targets[layout], this.camera.fov, this.camera.aspect, layout);
  }

  applyCameraFrame(layout) {
    const frame = this.getFrame(layout);
    this.camera.position.copy(frame.position);
    this.camera.up.set(0, 1, 0);
    this.controls.target.copy(frame.target);
    this.controls.update();
    this.render();
  }

  animateCameraFrame(layout, duration = CAMERA_TRANSITION_DURATION) {
    const frame = this.getFrame(layout);
    if (this.prefersReducedMotion) {
      this.applyCameraFrame(layout);
      return;
    }
    new TWEEN.Tween(this.camera.position)
      .to(frame.position, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate(this.render)
      .onComplete(() => this.controls.update())
      .start();
    new TWEEN.Tween(this.controls.target)
      .to(frame.target, duration)
      .easing(TWEEN.Easing.Cubic.InOut)
      .onUpdate(this.render)
      .onComplete(() => this.controls.update())
      .start();
  }

  transformTo(layout, { frameCamera = true } = {}) {
    const targets = this.targets[layout];
    if (!targets || targets.length !== this.objects.length) return;

    this.currentLayout = layout;
    TWEEN.removeAll();
    this.objects.forEach((object, index) => {
      const target = targets[index];
      const duration = this.prefersReducedMotion
        ? 150
        : Math.random() * TRANSITION_DURATION + TRANSITION_DURATION;

      new TWEEN.Tween(object.position)
        .to({ x: target.position.x, y: target.position.y, z: target.position.z }, duration)
        .easing(TWEEN.Easing.Exponential.InOut)
        .start();

      new TWEEN.Tween(object.rotation)
        .to({ x: target.rotation.x, y: target.rotation.y, z: target.rotation.z }, duration)
        .easing(TWEEN.Easing.Exponential.InOut)
        .start();
    });

    if (frameCamera) this.animateCameraFrame(layout);
    new TWEEN.Tween({})
      .to({}, this.prefersReducedMotion ? 150 : TRANSITION_DURATION * 2)
      .onUpdate(this.render)
      .start();
  }

  dispose() {
    this.isDisposed = true;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    if (this.resizeFrameId !== null) cancelAnimationFrame(this.resizeFrameId);
    TWEEN.removeAll();
    window.removeEventListener('resize', this.handleResize);
    this.controls.dispose();
    this.scene.clear();
    this.container.replaceChildren();
  }

  handleResize = () => {
    if (this.resizeFrameId !== null) return;
    this.resizeFrameId = requestAnimationFrame(() => {
      this.resizeFrameId = null;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.applyCameraFrame(this.currentLayout);
    });
  };

  render = () => {
    this.renderer.render(this.scene, this.camera);
  };

  animate = (time) => {
    if (this.isDisposed) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    TWEEN.update(time);
    this.controls.update();
  };
}
