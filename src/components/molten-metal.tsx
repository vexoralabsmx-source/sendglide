"use client";

import { useEffect, useRef } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import "./molten-metal.css";

type MoltenMetalProps = {
  color1?: string;
  color2?: string;
  color3?: string;
  speed?: number;
  scale?: number;
  detail?: number;
  glow?: number;
  coreSize?: number;
  swirl?: number;
  fold?: number;
  blackPoint?: number;
  brightness?: number;
  colorMode?: "molten" | "ember" | "frost";
  grain?: boolean;
  grainIntensity?: number;
  mouseInteraction?: boolean;
  mouseStrength?: number;
  opacity?: number;
  className?: string;
};

type Uniform<T> = { value: T };
type MetalUniforms = {
  iTime: Uniform<number>;
  iResolution: Uniform<Float32Array>;
  uSpeed: Uniform<number>;
  uScale: Uniform<number>;
  uDetail: Uniform<number>;
  uGlow: Uniform<number>;
  uCoreSize: Uniform<number>;
  uSwirl: Uniform<number>;
  uFold: Uniform<number>;
  uBlackPoint: Uniform<number>;
  uBrightness: Uniform<number>;
  uColorMode: Uniform<number>;
  uGrain: Uniform<number>;
  uGrainIntensity: Uniform<number>;
  uOpacity: Uniform<number>;
  uMouse: Uniform<Float32Array>;
  uMouseStrength: Uniform<number>;
  uEnableMouse: Uniform<boolean>;
  uColor1: Uniform<Float32Array>;
  uColor2: Uniform<Float32Array>;
  uColor3: Uniform<Float32Array>;
};

const vertex = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uScale;
uniform float uDetail;
uniform float uGlow;
uniform float uCoreSize;
uniform float uSwirl;
uniform float uFold;
uniform float uBlackPoint;
uniform float uBrightness;
uniform float uColorMode;
uniform float uGrain;
uniform float uGrainIntensity;
uniform float uOpacity;
uniform vec2 uMouse;
uniform float uMouseStrength;
uniform bool uEnableMouse;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  float time = iTime * uSpeed;
  vec2 p = uScale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;
  vec2 drift = vec2(0.0);
  if (uEnableMouse) drift = (uMouse - 0.5) * uMouseStrength * 2.0;
  p += drift;
  vec2 i = p;
  float c = 0.0;
  float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
  float d = length(p);
  float rot = d + time + p.x * uSwirl;
  float cosRot = cos(rot);
  mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * uFold;
  float glowCore = uGlow * uCoreSize;
  for (float n = 0.0; n < 8.0; n++) {
    if (n >= uDetail) break;
    p *= warp;
    float t = r - time / (n + 3.0);
    i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
    c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
  }
  c /= 6.0;
  float intensity = max(c - uBlackPoint, 0.0) * uBrightness;
  float g = clamp(intensity, 0.0, 1.0);
  float mid = uColorMode > 1.5 ? 0.65 : (uColorMode > 0.5 ? 0.35 : 0.5);
  vec3 col = mix(uColor1, uColor2, smoothstep(0.0, mid, g));
  col = mix(col, uColor3, smoothstep(mid, 1.0, g));
  float a = g;
  if (uGrain > 0.5) a += (hash(gl_FragCoord.xy + iTime) - 0.5) * uGrainIntensity;
  a = clamp(a, 0.0, 1.0) * uOpacity;
  fragColor = vec4(col * a, a);
}
`;

function hexToRgb(hex: string): Float32Array {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return new Float32Array([1, 1, 1]);
  return new Float32Array([
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  ]);
}

function modeToFloat(mode: MoltenMetalProps["colorMode"]): number {
  return mode === "ember" ? 1 : mode === "frost" ? 2 : 0;
}

export function MoltenMetal({
  color1 = "#000000",
  color2 = "#d8ff65",
  color3 = "#ffffff",
  speed = 0.2,
  scale = 4,
  detail = 3,
  glow = 1.5,
  coreSize = 0.08,
  swirl = 0.8,
  fold = -0.2,
  blackPoint = 0.08,
  brightness = 1.1,
  colorMode = "molten",
  grain = true,
  grainIntensity = 0.025,
  mouseInteraction = true,
  mouseStrength = 0.16,
  opacity = 0.45,
  className = "",
}: MoltenMetalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let renderer: Renderer;
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      });
    } catch {
      container.dataset.fallback = "true";
      return;
    }

    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.setAttribute("aria-hidden", "true");
    container.appendChild(canvas);
    const geometry = new Triangle(gl);
    const values = {
      color1,
      color2,
      color3,
      speed,
      scale,
      detail,
      glow,
      coreSize,
      swirl,
      fold,
      blackPoint,
      brightness,
      colorMode,
      grain,
      grainIntensity,
      mouseInteraction,
      mouseStrength,
      opacity,
    };
    const uniforms: MetalUniforms = {
      iTime: { value: 0 },
      iResolution: { value: new Float32Array([1, 1]) },
      uSpeed: { value: reduceMotion ? 0 : values.speed },
      uScale: { value: values.scale },
      uDetail: { value: values.detail },
      uGlow: { value: values.glow },
      uCoreSize: { value: Math.max(values.coreSize, 0.001) },
      uSwirl: { value: values.swirl },
      uFold: { value: values.fold },
      uBlackPoint: { value: values.blackPoint },
      uBrightness: { value: values.brightness },
      uColorMode: { value: modeToFloat(values.colorMode) },
      uGrain: { value: values.grain ? 1 : 0 },
      uGrainIntensity: { value: values.grainIntensity },
      uOpacity: { value: values.opacity },
      uMouse: { value: new Float32Array([0.5, 0.5]) },
      uMouseStrength: { value: values.mouseStrength },
      uEnableMouse: { value: values.mouseInteraction && !reduceMotion },
      uColor1: { value: hexToRgb(values.color1) },
      uColor2: { value: hexToRgb(values.color2) },
      uColor3: { value: hexToRgb(values.color3) },
    };
    const program = new Program(gl, { vertex, fragment, uniforms });
    const mesh = new Mesh(gl, { geometry, program });

    const render = () => renderer.render({ scene: mesh });
    const setSize = () => {
      const rect = container.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
      uniforms.iResolution.value[0] = gl.drawingBufferWidth;
      uniforms.iResolution.value[1] = gl.drawingBufferHeight;
      render();
    };
    const resizeObserver = new ResizeObserver(setSize);
    resizeObserver.observe(container);
    setSize();

    const targetMouse = [0.5, 0.5];
    const currentMouse = [0.5, 0.5];
    const onPointerMove = (event: PointerEvent) => {
      targetMouse[0] = event.clientX / Math.max(window.innerWidth, 1);
      targetMouse[1] = 1 - event.clientY / Math.max(window.innerHeight, 1);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    let frame = 0;
    let visible = true;
    let pageVisible = !document.hidden;
    const startedAt = performance.now();
    const loop = (time: number) => {
      uniforms.iTime.value = (time - startedAt) * 0.001;
      currentMouse[0] += 0.04 * (targetMouse[0] - currentMouse[0]);
      currentMouse[1] += 0.04 * (targetMouse[1] - currentMouse[1]);
      uniforms.uMouse.value[0] = currentMouse[0];
      uniforms.uMouse.value[1] = currentMouse[1];
      render();
      frame = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!reduceMotion && visible && pageVisible && frame === 0)
        frame = requestAnimationFrame(loop);
      else if (reduceMotion) render();
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) start();
      else stop();
    });
    intersectionObserver.observe(container);
    const onVisibility = () => {
      pageVisible = !document.hidden;
      if (pageVisible) start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [
    blackPoint,
    brightness,
    color1,
    color2,
    color3,
    colorMode,
    coreSize,
    detail,
    fold,
    glow,
    grain,
    grainIntensity,
    mouseInteraction,
    mouseStrength,
    opacity,
    scale,
    speed,
    swirl,
  ]);

  return (
    <div
      ref={containerRef}
      className={`molten-metal-container ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
