import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils, type VRM } from '@pixiv/three-vrm';
import { validateAsset, type RoomMetadata } from './format';
import { groundHeight, intersectsPlayer, movePlayer } from './physics';
import { AvatarLocomotion, loadMotionLibrary, type MotionState } from './locomotion';
import type { Pose } from '../network/protocol';

interface RemotePlayer { group: THREE.Group; fallback: THREE.Group; target?: Pose; avatar?: VRM; root?: THREE.Group; locomotion?: AvatarLocomotion; phase: number; lastPose: number; }

export interface WorldStats { x: number; y: number; z: number; fps: number; moving: boolean; motion: MotionState; speed: number }
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(48, 1, 0.05, 250);
  readonly player = new THREE.Group();
  private remotes = new Map<string, RemotePlayer>();
  private networkSpeed = 0;
  private networkRunning = false;
  private room?: THREE.Group;
  private avatar?: VRM;
  private avatarRoot?: THREE.Group;
  private locomotion?: AvatarLocomotion;
  private horizontalVelocity = new THREE.Vector3();
  private previousPosition = new THREE.Vector3();
  private fallback: THREE.Group;
  private colliders: THREE.Box3[] = [];
  private spawn = new THREE.Vector3(0, 0, 0);
  private spawnYaw = Math.PI;
  private yaw = 0.52;
  private pitch = 0.52;
  private distance = 6.2;
  private keys = new Set<string>();
  private controller = new AbortController();
  private resizeObserver: ResizeObserver;
  private previous = 0;
  private phase = 0;
  private speedBlend = 0;
  private elapsed = 0;
  private ready = false;
  private disposed = false;
  private roomRequest = 0;
  private avatarRequest = 0;
  private velocityY = 0;
  private lastStats = 0;
  private frameCount = 0;
  private mixer?: THREE.AnimationMixer;
  private raycaster = new THREE.Raycaster();
  private cameraTarget = new THREE.Vector3();
  private desiredCamera = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private move = new THREE.Vector3();
  onStats?: (stats: WorldStats) => void;
  onError?: (message: string) => void;

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    const canvas = this.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', '3Dルーム。WASDまたは矢印キーで移動、ドラッグで視点を変更。');
    container.prepend(canvas);
    this.scene.background = new THREE.Color('#cbd8d7');
    this.scene.add(new THREE.HemisphereLight(0xe9f3ff, 0xa99578, 2.7));
    const sun = new THREE.DirectionalLight(0xffebd0, 3.5);
    sun.position.set(5, 9, 3); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 35 });
    sun.shadow.normalBias = 0.035; sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    this.fallback = this.makeFallback();
    this.player.add(this.fallback); this.scene.add(this.player);
    const signal = this.controller.signal;
    const movementKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];
    canvas.addEventListener('keydown', event => {
      if (movementKeys.includes(event.code)) { event.preventDefault(); this.keys.add(event.code); }
      if (event.code === 'KeyR') this.resetPosition();
    }, { signal });
    window.addEventListener('keyup', event => this.keys.delete(event.code), { signal });
    window.addEventListener('blur', () => this.keys.clear(), { signal });
    canvas.addEventListener('blur', () => this.keys.clear(), { signal });
    document.addEventListener('visibilitychange', () => { this.keys.clear(); this.previous = 0; }, { signal });
    let pointer: number | undefined;
    let lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || pointer !== undefined) return;
      canvas.focus(); pointer = event.pointerId; lastX = event.clientX; lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (pointer !== event.pointerId) return;
      this.yaw -= (event.clientX - lastX) * 0.005;
      this.pitch = THREE.MathUtils.clamp(this.pitch + (event.clientY - lastY) * 0.004, 0.08, 1.2);
      lastX = event.clientX; lastY = event.clientY;
    }, { signal });
    canvas.addEventListener('lostpointercapture', () => { pointer = undefined; }, { signal });
    canvas.addEventListener('pointerup', () => { pointer = undefined; }, { signal });
    canvas.addEventListener('pointercancel', () => { pointer = undefined; }, { signal });
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); this.distance = THREE.MathUtils.clamp(this.distance + event.deltaY * 0.006, 1.7, 10);
    }, { passive: false, signal });
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.renderer.setAnimationLoop(null);
      this.onError?.('3D描画が停止しました。ページを再読み込みしてください。');
    }, { signal });
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(time => this.frame(time));
  }

  private makeFallback(): THREE.Group {
    const group = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: '#edf1e7', roughness: 0.7 });
    const green = new THREE.MeshStandardMaterial({ color: '#5c8575', roughness: 0.65 });
    const visor = new THREE.MeshStandardMaterial({ color: '#253c3a', roughness: 0.35 });
    const part = (geometry: THREE.BufferGeometry, material: THREE.Material, position: number[]) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.fromArray(position); mesh.castShadow = true; group.add(mesh); return mesh;
    };
    part(new THREE.CapsuleGeometry(0.23, 0.37, 8, 16), bodyMat, [0, 0.97, 0]);
    part(new THREE.SphereGeometry(0.24, 24, 16), green, [0, 1.52, 0]);
    const face = part(new THREE.SphereGeometry(0.18, 20, 12), visor, [0, 1.53, 0.16]); face.scale.set(1, 0.55, 0.4);
    for (const side of [-1, 1]) {
      const leg = part(new THREE.CapsuleGeometry(0.085, 0.4, 6, 12), green, [side * 0.12, 0.36, 0]); leg.name = side < 0 ? 'leftLeg' : 'rightLeg';
      const arm = part(new THREE.CapsuleGeometry(0.065, 0.38, 6, 12), bodyMat, [side * 0.32, 0.98, 0]); arm.name = side < 0 ? 'leftArm' : 'rightArm';
    }
    return group;
  }

  private loader(avatar = false): GLTFLoader {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier(url => {
      if (!url.startsWith('blob:')) throw new Error('外部リソースの読み込みは無効です。');
      return url;
    });
    const loader = new GLTFLoader(manager);
    if (avatar) loader.register(parser => new VRMLoaderPlugin(parser));
    return loader;
  }

  async loadRoom(bytes: ArrayBuffer): Promise<RoomMetadata | undefined> {
    const request = ++this.roomRequest;
    const asset = validateAsset(bytes, 'room');
    let gltf: GLTF | undefined;
    try {
      gltf = await this.loader().parseAsync(bytes, '');
      if (request !== this.roomRequest || this.disposed) { this.disposeGltf(gltf); return; }
      gltf.scene.updateMatrixWorld(true);
      const colliders: THREE.Box3[] = [];
      const spawn = new THREE.Vector3(); let yaw = 0;
      const nodeObjects = new Map<number, THREE.Object3D>();
      gltf.scene.traverse(object => {
        const index = gltf!.parser.associations.get(object)?.nodes;
        if (index !== undefined) nodeObjects.set(index, object);
        if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; }
      });
      for (const [index, components] of asset.components) {
        const object = nodeObjects.get(index);
        if (!object) throw new Error(`Componentのノード${index}が見つかりません。`);
        for (const component of components) {
          if (component.type === 'spawn') {
            object.getWorldPosition(spawn);
            const rotation = new THREE.Euler().setFromQuaternion(object.getWorldQuaternion(new THREE.Quaternion()), 'YXZ');
            yaw = rotation.y + component.yaw;
          } else {
            const center = new THREE.Vector3().fromArray(component.center);
            const size = new THREE.Vector3().fromArray(component.size);
            colliders.push(new THREE.Box3().setFromCenterAndSize(center, size).applyMatrix4(object.matrixWorld));
          }
        }
      }
      if (intersectsPlayer(spawn, colliders)) throw new Error('出現位置がColliderと重なっています。ルームのSpawnを修正してください。');
      const ground = groundHeight(spawn, colliders, spawn.y);
      if (ground === undefined || spawn.y - ground > 3) throw new Error('出現位置の下に床Colliderがありません。');
      // Swap only after validation and construction; keep the old room on failure.
      this.mixer?.stopAllAction();
      if (this.room) { this.mixer?.uncacheRoot(this.room); this.scene.remove(this.room); this.disposeObject(this.room); }
      this.room = gltf.scene; this.scene.add(this.room);
      this.colliders = colliders; this.spawn.copy(spawn); this.spawnYaw = yaw;
      this.scene.background = new THREE.Color(asset.metadata!.background);
      this.mixer = new THREE.AnimationMixer(this.room);
      for (const clip of gltf.animations) this.mixer.clipAction(clip).play();
      this.ready = true; this.resetPosition();
      return asset.metadata;
    } catch (error) {
      if (gltf && gltf.scene !== this.room) this.disposeGltf(gltf);
      throw error;
    }
  }

  async loadAvatar(bytes: ArrayBuffer): Promise<boolean> {
    const request = ++this.avatarRequest;
    const { avatar, root, locomotion } = await this.createAvatar(bytes);
    if (request !== this.avatarRequest || this.disposed) { locomotion.dispose(); this.disposeObject(root); return false; }
    this.clearAvatar(); this.locomotion = locomotion; this.player.add(root);
    avatar.scene.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    this.avatar = avatar; this.avatarRoot = root; this.fallback.visible = false;
    avatar.update(0); this.player.updateMatrixWorld(true); avatar.springBoneManager?.reset();
    return true;
  }

  private async createAvatar(bytes: ArrayBuffer) {
    validateAsset(bytes, 'avatar');
    const library = await loadMotionLibrary();
    const gltf = await this.loader(true).parseAsync(bytes, '');
    const avatar: VRM | undefined = gltf.userData.vrm;
    if (!avatar) { this.disposeGltf(gltf); throw new Error('VRMのHumanoidを読み取れませんでした。'); }
    VRMUtils.rotateVRM0(avatar);
    avatar.scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(avatar.scene);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height < 0.1 || height > 10) { this.disposeGltf(gltf); throw new Error('アバターのサイズが不正です。'); }
    const root = new THREE.Group();
    // Fit visuals to the fixed player capsule; preserve the model's internal rig.
    root.scale.setScalar(1.72 / height);
    avatar.scene.position.y -= bounds.min.y;
    root.add(avatar.scene);
    root.updateMatrixWorld(true);
    let locomotion: AvatarLocomotion;
    try { locomotion = new AvatarLocomotion(avatar, library); }
    catch (error) { this.disposeGltf(gltf); throw error; }
    avatar.scene.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
    return { avatar, root, locomotion };
  }

  networkPose(): Pose {
    return { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.player.rotation.y, speed: this.networkSpeed, running: this.networkRunning };
  }
  addRemote(id: string, name: string): void {
    if (this.remotes.has(id) || this.remotes.size >= 5) return;
    const group = new THREE.Group(), fallback = this.makeFallback();
    group.add(fallback); group.visible = false;
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 80;
    const ctx = canvas.getContext('2d')!;
    ctx.font = '28px sans-serif'; canvas.width = Math.min(512, Math.max(96, Math.ceil(ctx.measureText(name).width) + 40));
    ctx.fillStyle = '#17252ddd'; ctx.roundRect(0, 0, canvas.width, 80, 28); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.font = '28px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(name, canvas.width / 2, 40, canvas.width - 24);
    const texture = new THREE.CanvasTexture(canvas);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    label.position.y = 2.08; label.scale.set(canvas.width / 285, 0.28, 1); group.add(label);
    this.scene.add(group);
    this.remotes.set(id, { group, fallback, phase: 0, lastPose: 0 });
  }
  async loadRemoteAvatar(id: string, bytes: ArrayBuffer): Promise<void> {
    const remote = this.remotes.get(id); if (!remote) return;
    const { avatar, root, locomotion } = await this.createAvatar(bytes);
    if (this.disposed || this.remotes.get(id) !== remote) { locomotion.dispose(); this.disposeObject(root); return; }
    remote.avatar = avatar; remote.root = root; remote.locomotion = locomotion;
    remote.group.add(root); remote.fallback.visible = false;
    avatar.update(0); remote.group.updateMatrixWorld(true); avatar.springBoneManager?.reset();
  }
  updateRemote(id: string, pose: Pose): void {
    const remote = this.remotes.get(id); if (!remote) return;
    if (!remote.target || remote.group.position.distanceTo(new THREE.Vector3(pose.x, pose.y, pose.z)) > 5) {
      remote.group.position.set(pose.x, pose.y, pose.z); remote.group.rotation.y = pose.yaw;
    }
    remote.target = pose; remote.lastPose = performance.now(); remote.group.visible = true;
  }
  removeRemote(id: string): void {
    const remote = this.remotes.get(id); if (!remote) return;
    this.remotes.delete(id); remote.locomotion?.dispose(); this.scene.remove(remote.group);
    for (const child of remote.group.children) if (child instanceof THREE.Sprite) { child.material.map?.dispose(); child.material.dispose(); }
    this.disposeObject(remote.group);
  }
  private animateRemotes(dt: number): void {
    for (const remote of this.remotes.values()) {
      const target = remote.target; if (!target) continue;
      const alpha = 1 - Math.exp(-15 * dt);
      remote.group.position.lerp(new THREE.Vector3(target.x, target.y, target.z), alpha);
      const diff = Math.atan2(Math.sin(target.yaw - remote.group.rotation.y), Math.cos(target.yaw - remote.group.rotation.y));
      remote.group.rotation.y += diff * alpha;
      const speed = performance.now() - remote.lastPose > 1000 ? 0 : target.speed;
      if (remote.avatar) {
        const steps = Math.max(1, Math.ceil(dt * 60));
        for (let i = 0; i < steps; i++) { remote.locomotion?.update(dt / steps, speed, target.running); remote.avatar.update(dt / steps); }
      } else {
        remote.phase += dt * (target.running ? 13 : 9);
        const stride = Math.sin(remote.phase) * 0.45 * Math.min(1, speed / 1.4);
        for (const [name, sign] of [['leftLeg', -1], ['rightLeg', 1], ['leftArm', 1], ['rightArm', -1]] as const) remote.fallback.getObjectByName(name)!.rotation.x = stride * sign;
      }
    }
  }

  private disposeObject(root: THREE.Object3D): void {
    const textures = new Set<THREE.Texture>();
    root.traverse(object => {
      if (object instanceof THREE.SkinnedMesh) object.skeleton.dispose();
      if (!(object instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) {
          if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
        }
      }
    });
    VRMUtils.deepDispose(root);
    for (const texture of textures) {
      texture.dispose();
      if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) texture.image.close();
    }
  }
  private disposeGltf(gltf: GLTF): void { for (const scene of new Set(gltf.scenes)) this.disposeObject(scene); }
  private clearAvatar(): void {
    this.locomotion?.dispose(); this.locomotion = undefined;
    if (this.avatarRoot) { this.player.remove(this.avatarRoot); this.disposeObject(this.avatarRoot); }
    this.avatarRoot = undefined; this.avatar = undefined; this.fallback.visible = true;
  }
  useDefaultAvatar(): void { ++this.avatarRequest; this.clearAvatar(); }
  resetPosition(): void {
    this.player.position.copy(this.spawn); this.player.rotation.y = this.spawnYaw;
    this.horizontalVelocity.set(0, 0, 0); this.locomotion?.reset();
    this.velocityY = 0; this.keys.clear(); this.yaw = 0.52; this.pitch = 0.52; this.distance = 6.2;
    if (this.avatar) { this.avatar.update(0); this.player.updateMatrixWorld(true); this.avatar.springBoneManager?.reset(); }
    this.updateCamera(1);
  }
  setMovement(key: string, active: boolean): void { if (active) this.keys.add(key); else this.keys.delete(key); }
  focus(): void { this.renderer.domElement.focus(); }
  private resize(): void {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix(); this.renderer.setSize(width, height, false);
  }
  private updateCamera(alpha: number): void {
    this.cameraTarget.copy(this.player.position).add(new THREE.Vector3(0, 1.05, 0));
    this.direction.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    let distance = this.distance;
    if (this.room) {
      this.raycaster.set(this.cameraTarget, this.direction); this.raycaster.far = distance;
      const hit = this.raycaster.intersectObject(this.room, true)[0];
      if (hit) distance = Math.max(0.35, hit.distance - 0.2);
    }
    this.desiredCamera.copy(this.cameraTarget).addScaledVector(this.direction, distance);
    this.camera.position.lerp(this.desiredCamera, alpha); this.camera.lookAt(this.cameraTarget);
  }
  private frame(time: number): void {
    if (this.disposed) return;
    const dt = this.previous ? Math.min((time - this.previous) / 1000, 0.05) : 0;
    this.previous = time; this.elapsed += dt; this.frameCount++;
    let moving = false;
    let actualSpeed = 0;
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    if (this.ready) {
      const x = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'));
      const z = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'));
      this.move.set(x, 0, z);
      moving = this.move.lengthSq() > 0;
      if (moving) {
        this.move.normalize().applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw);
        const targetAngle = Math.atan2(this.move.x, this.move.z);
        const difference = Math.atan2(Math.sin(targetAngle - this.player.rotation.y), Math.cos(targetAngle - this.player.rotation.y));
        this.player.rotation.y += difference * Math.min(dt * 12, 1);
        this.move.multiplyScalar(running ? 3.2 : 1.4);
      }
      this.horizontalVelocity.lerp(this.move, 1 - Math.exp(-dt * (moving ? 10 : 18)));
      if (!moving && this.horizontalVelocity.lengthSq() < 0.0001) this.horizontalVelocity.set(0, 0, 0);
      this.previousPosition.copy(this.player.position);
      movePlayer(this.player.position, this.move.copy(this.horizontalVelocity).multiplyScalar(dt), this.colliders);
      actualSpeed = dt > 0 ? this.player.position.distanceTo(this.previousPosition) / dt : 0;
      moving = actualSpeed > 0.025;
      const ground = groundHeight(this.player.position, this.colliders, this.player.position.y);
      this.velocityY -= 16 * dt;
      this.player.position.y += this.velocityY * dt;
      if (ground !== undefined && this.player.position.y <= ground) { this.player.position.y = ground; this.velocityY = 0; }
      if (this.player.position.y < -20) this.resetPosition();
      this.speedBlend = THREE.MathUtils.damp(this.speedBlend, moving ? 1 : 0, 10, dt);
      this.phase += dt * (moving ? 9 : 2);
      const stride = Math.sin(this.phase) * 0.45 * this.speedBlend;
      if (this.avatar) {
        this.avatar.expressionManager?.setValue('blink', Math.pow(Math.max(0, Math.sin(this.elapsed * 1.5)), 70));
        const steps = Math.max(1, Math.ceil(dt * 60));
        for (let step = 0; step < steps; step++) {
          this.locomotion?.update(dt / steps, actualSpeed, running);
          this.avatar.update(dt / steps);
        }
      } else {
        this.fallback.getObjectByName('leftLeg')!.rotation.x = -stride;
        this.fallback.getObjectByName('rightLeg')!.rotation.x = stride;
        this.fallback.getObjectByName('leftArm')!.rotation.x = stride;
        this.fallback.getObjectByName('rightArm')!.rotation.x = -stride;
        this.fallback.position.y = Math.abs(Math.sin(this.phase)) * 0.035 * this.speedBlend;
      }
      this.mixer?.update(dt); this.updateCamera(1 - Math.exp(-12 * dt));
    }
    this.networkSpeed = actualSpeed; this.networkRunning = running;
    this.animateRemotes(dt);
    this.renderer.render(this.scene, this.camera);
    if (time - this.lastStats > 500) {
      this.onStats?.({ ...this.player.position, fps: Math.round(this.frameCount * 1000 / (time - this.lastStats)), moving, motion: this.locomotion?.state ?? (moving ? running ? 'run' : 'walk' : 'idle'), speed: actualSpeed });
      this.container.dataset.remotes = JSON.stringify([...this.remotes].map(([id, remote]) => ({ id, x: remote.group.position.x, z: remote.group.position.z, avatar: !!remote.avatar, visible: remote.group.visible })));
      this.lastStats = time; this.frameCount = 0;
    }
  }

  dispose(): void {
    this.disposed = true; ++this.roomRequest; ++this.avatarRequest;
    this.renderer.setAnimationLoop(null); this.controller.abort(); this.resizeObserver.disconnect();
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    this.mixer?.stopAllAction(); this.clearAvatar();
    this.disposeObject(this.scene); this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
