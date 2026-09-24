import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { shared } from './materials';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: shared.uTime,
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uRes;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);
      vec2 off = c * r2 * 0.007;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      col *= 1.0 - r2 * 0.85;
      col += vec3(0.010, 0.003, 0.018) * (1.0 - col);
      float g = fract(sin(dot(vUv * uRes + fract(uTime * 7.13) * 100.0, vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.028;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * Occlusion ambiante en espace écran (profondeur seule, normales reconstruites) :
 * assombrit les recoins, pieds de murs, dessous d'auvents et de passerelles.
 */
class AOPass extends Pass {
  private quad: FullScreenQuad;
  mat: THREE.ShaderMaterial;
  constructor(private camera: THREE.PerspectiveCamera) {
    super();
    this.needsSwap = true;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null },
        uProj: { value: new THREE.Matrix4() }, uInvProj: { value: new THREE.Matrix4() },
        uRes: { value: new THREE.Vector2(1, 1) }, uRadius: { value: 1.3 }, uStrength: { value: 2.2 }, uEnabled: { value: 1 },
      },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform mat4 uProj;
        uniform mat4 uInvProj;
        uniform vec2 uRes;
        uniform float uRadius;
        uniform float uStrength;
        uniform float uEnabled;
        varying vec2 vUv;
        vec3 vpos(vec2 uv){
          float d = textureLod(tDepth, uv, 0.0).x;
          vec4 p = uInvProj * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
          return p.xyz / p.w;
        }
        float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
        void main(){
          vec4 col = texture2D(tDiffuse, vUv);
          float d = texture2D(tDepth, vUv).x;
          if (uEnabled < 0.5 || d >= 0.99999) { gl_FragColor = col; return; }
          vec3 P = vpos(vUv);
          vec2 px = 1.0 / uRes;
          vec3 dx1 = vpos(vUv + vec2(px.x, 0.0)) - P, dx2 = P - vpos(vUv - vec2(px.x, 0.0));
          vec3 dy1 = vpos(vUv + vec2(0.0, px.y)) - P, dy2 = P - vpos(vUv - vec2(0.0, px.y));
          vec3 dx = dot(dx1, dx1) < dot(dx2, dx2) ? dx1 : dx2;
          vec3 dy = dot(dy1, dy1) < dot(dy2, dy2) ? dy1 : dy2;
          vec3 N = normalize(cross(dx, dy));
          if (dot(N, -P) < 0.0) N = -N;
          float rs = clamp(uRadius * uProj[1][1] / -P.z * 0.5, 3.0 * px.y, 0.09);
          float a0 = ign(gl_FragCoord.xy) * 6.2831;
          float occ = 0.0;
          for (int i = 0; i < 12; i++) {
            float fi = float(i);
            float a = a0 + fi * 2.39996;
            float r = sqrt((fi + 0.5) / 12.0);
            vec2 o = vec2(cos(a) * uRes.y / uRes.x, sin(a)) * r * rs;
            vec3 v = vpos(vUv + o) - P;
            float dist = length(v);
            float nd = dot(N, v) / (dist + 1e-4);
            occ += max(nd - 0.12, 0.0) * (1.0 - smoothstep(uRadius * 0.6, uRadius * 1.8, dist));
          }
          occ /= 12.0;
          float ao = 1.0 - clamp(occ * uStrength, 0.0, 0.8);
          float lum = dot(col.rgb, vec3(0.3, 0.59, 0.11));
          ao = mix(ao, 1.0, smoothstep(0.6, 2.5, lum));
          gl_FragColor = vec4(col.rgb * ao, col.a);
        }
      `,
    });
    this.quad = new FullScreenQuad(this.mat);
  }
  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.mat.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uProj.value.copy(this.camera.projectionMatrix);
    u.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    u.uRes.value.set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  ao: AOPass;
  private grade: ShaderPass;

  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    rt.depthTexture = new THREE.DepthTexture(size.x, size.y);
    rt.depthTexture.type = THREE.FloatType;
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new AOPass(camera);
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.grade.uniforms.uTime = shared.uTime; // ShaderPass clone les uniformes : on rebranche le temps partagé
    this.composer.addPass(this.grade);
    this.resize();
  }

  resize() {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.grade.uniforms.uRes.value.copy(s);
  }

  render() {
    this.composer.render();
  }
}
