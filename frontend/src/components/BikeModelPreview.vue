<template>
  <section class="model-picker">
    <div class="model-picker-head">
      <strong>{{ t('bikeModel') }}</strong>
      <label class="model-select-label">
        <span class="sr-only">{{ t('selectBikeModel') }}</span>
        <select :value="modelValue" @change="$emit('update:modelValue', Number($event.target.value))">
          <option v-for="model in models" :key="model.id" :value="model.id">{{ model.name }}</option>
        </select>
      </label>
    </div>
    <div class="model-viewer" :aria-label="t('modelPreview')">
      <canvas ref="canvas"></canvas>
      <span v-if="!ready" class="model-loading">{{ t('loading') }}</span>
    </div>
    <p class="muted model-caption">{{ selected?.description || t('modelPreview') }}</p>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { request } from '../api/client.js';
import { t } from '../i18n/index.js';

const props = defineProps({ modelValue: { type: Number, default: null } });
const emit = defineEmits(['update:modelValue']);
const canvas = ref(null);
const models = ref([]);
const ready = ref(false);
const selected = computed(() => models.value.find((model) => model.id === props.modelValue) || models.value[0]);
const defaultModels = [
  { id: 1, model_key: 'city-commuter', name: 'City Commuter', description: 'Lightweight city bicycle with a clean commuter frame.', preview_type: 'bike-city', color: '#128c75' },
  { id: 2, model_key: 'campus-classic', name: 'Campus Classic', description: 'Comfort-focused classic bicycle for campus routes.', preview_type: 'bike-classic', color: '#e27a3f' },
  { id: 3, model_key: 'sport-hybrid', name: 'Sport Hybrid', description: 'Responsive hybrid bicycle with a vivid sport finish.', preview_type: 'bike-sport', color: '#3478c8' }
];
let renderer;
let scene;
let camera;
let frame;
let bike;
let resizeObserver;
let THREE_MODULE;

function tube(THREE, parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const direction = new THREE.Vector3().subVectors(end, start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 10), material);
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  parent.add(mesh);
}

function buildBike(THREE, color, previewType = 'bike-city') {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.3 });
  const rubber = new THREE.MeshStandardMaterial({ color: '#202a32', metalness: 0.08, roughness: 0.8 });
  const metal = new THREE.MeshStandardMaterial({ color: '#d7e0e5', metalness: 0.8, roughness: 0.25 });
  const wheelY = 0.82;
  const wheelRadius = previewType === 'bike-sport' ? 0.57 : 0.62;
  for (const x of [-1.12, 1.12]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, previewType === 'bike-sport' ? 0.04 : 0.055, 10, 48), rubber);
    wheel.position.set(x, wheelY, 0);
    group.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 16), metal);
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, wheelY, 0);
    group.add(hub);
  }
  const rear = [-1.12, wheelY, 0]; const front = [1.12, wheelY, 0];
  const crank = [-0.18, 0.83, 0]; const seat = [-0.48, 1.68, 0]; const head = [0.66, 1.58, 0];
  [[rear, crank], [crank, seat], [seat, head], [head, crank], [rear, seat], [front, head]].forEach(([a, b]) => tube(THREE, group, a, b, 0.045, frameMaterial));
  tube(THREE, group, [-0.58, 1.72, 0], [-0.18, 1.72, 0], 0.075, rubber);
  tube(THREE, group, [0.62, 1.58, 0], [0.88, 1.95, 0], 0.035, metal);
  tube(THREE, group, [0.7, 1.95, -0.3], [1.08, 1.95, 0.3], 0.04, rubber);
  if (previewType === 'bike-classic') {
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.22, 0.36), new THREE.MeshStandardMaterial({ color: '#bd8755', roughness: 0.76 }));
    basket.position.set(0.96, 1.7, 0);
    group.add(basket);
  }
  if (previewType === 'bike-sport') {
    tube(THREE, group, [-0.18, 0.83, -0.12], [-0.18, 0.83, 0.12], 0.025, metal);
    tube(THREE, group, [-0.48, 1.68, -0.08], [-0.48, 1.68, 0.08], 0.028, metal);
  }
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.035, 48), new THREE.MeshStandardMaterial({ color: '#e6ecef', roughness: 0.9 }));
  ground.position.y = 0.08;
  group.add(ground);
  return group;
}

function render() {
  if (!renderer || !bike) return;
  bike.rotation.y += 0.006;
  renderer.render(scene, camera);
  frame = requestAnimationFrame(render);
}

async function loadModels() {
  try {
    const data = await request('/models');
    models.value = Array.isArray(data) && data.length ? data : defaultModels;
  } catch {
    models.value = defaultModels;
  }
  if (!props.modelValue && models.value[0]) emit('update:modelValue', models.value[0].id);
}

onMounted(async () => {
  try {
    THREE_MODULE = await import('three');
    await loadModels();
    const THREE = THREE_MODULE;
    scene = new THREE.Scene();
    scene.background = new THREE.Color('#f5f8f8');
    camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 2.45, 6.4);
    camera.lookAt(0, 1.1, 0);
    renderer = new THREE.WebGLRenderer({ canvas: canvas.value, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene.add(new THREE.HemisphereLight('#ffffff', '#84949a', 2.2));
    const key = new THREE.DirectionalLight('#ffffff', 3);
    key.position.set(-3, 5, 4);
    scene.add(key);
    if (selected.value) {
      bike = buildBike(THREE, selected.value.color || '#128c75', selected.value.preview_type);
      scene.add(bike);
    }
    resizeObserver = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(canvas.value.parentElement);
    ready.value = true;
    render();
  } catch (error) {
    console.warn('3D bike preview unavailable:', error);
  }
});

watch(selected, (model) => {
  if (!model || !scene || !THREE_MODULE) return;
  if (bike) scene.remove(bike);
  bike = buildBike(THREE_MODULE, model.color || '#128c75', model.preview_type);
  scene.add(bike);
}, { immediate: true });

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  renderer?.dispose();
});
</script>
