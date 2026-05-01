import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import '../styles/portfolio.css';

gsap.registerPlugin(ScrollTrigger);

// ── Simplex Noise GLSL ──
const noiseGLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

const blobVertex = `
${noiseGLSL}
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;
uniform vec2 uMouse;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisplacement;
void main(){
  vec3 pos = position;
  float noise = snoise(pos * uFrequency + uTime * 0.4);
  noise += 0.5 * snoise(pos * uFrequency * 2.0 + uTime * 0.2);
  float mouseEffect = smoothstep(2.0, 0.0, length(pos.xy - uMouse * 0.5)) * 0.15;
  float displacement = noise * uAmplitude + mouseEffect;
  pos += normal * displacement;
  vNormal = normalize(normalMatrix * normal);
  vWorldPos = (modelMatrix * vec4(pos, 1.0)).xyz;
  vDisplacement = displacement;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}`;

const blobFragment = `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uTime;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vDisplacement;
void main(){
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float fresnel = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
  vec3 color = mix(uColorA, uColorB, vDisplacement * 2.0 + 0.5);
  color += fresnel * vec3(0.4, 0.2, 0.8);
  color += vNormal * 0.08;
  float rim = fresnel * 0.6;
  gl_FragColor = vec4(color + rim, 0.92);
}`;

const particleVertex = `
attribute float aScale;
attribute float aRandom;
uniform float uTime;
uniform float uSize;
varying float vAlpha;
void main(){
  vec3 pos = position;
  pos.y += sin(uTime * 0.3 + aRandom * 6.28) * 0.4;
  pos.x += cos(uTime * 0.2 + aRandom * 6.28) * 0.3;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = uSize * aScale * (250.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
  vAlpha = aScale;
}`;

const particleFragment = `
uniform vec3 uColor;
varying float vAlpha;
void main(){
  float d = length(gl_PointCoord - vec2(0.5));
  if(d > 0.5) discard;
  float a = 1.0 - smoothstep(0.2, 0.5, d);
  gl_FragColor = vec4(uColor, a * vAlpha * 0.5);
}`;

// ── Main Component ──
const PortfolioApp = () => {
  const canvasRef = useRef(null);
  const cursorDotRef = useRef(null);
  const cursorRingRef = useRef(null);

  // ── Three.js Scene ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    camera.position.z = 4;

    // Blob
    const blobGeo = new THREE.IcosahedronGeometry(1.5, 64);
    const blobMat = new THREE.ShaderMaterial({
      vertexShader: blobVertex,
      fragmentShader: blobFragment,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uAmplitude: { value: 0.3 },
        uFrequency: { value: 1.5 },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uColorA: { value: new THREE.Color('#7c3aed') },
        uColorB: { value: new THREE.Color('#3b82f6') },
      },
    });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    scene.add(blob);

    // Particles
    const pCount = 1500;
    const pGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(pCount * 3);
    const scales = new Float32Array(pCount);
    const randoms = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 25;
      scales[i] = Math.random();
      randoms[i] = Math.random();
    }
    pGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pGeo.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    pGeo.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    const pMat = new THREE.ShaderMaterial({
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: 4 },
        uColor: { value: new THREE.Color('#ffffff') },
      },
    });
    const particles = new THREE.Points(pGeo, pMat);
    scene.add(particles);

    // Scroll state
    const scroll = { progress: 0, smooth: 0 };
    ScrollTrigger.create({
      trigger: '.content-wrapper',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 0,
      onUpdate: (self) => { scroll.progress = self.progress; },
    });

    // Mouse
    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMouseMove = (e) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener('mousemove', onMouseMove);

    // Resize
    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onResize);

    // Color palette per section
    const palette = [
      { a: '#7c3aed', b: '#3b82f6' },   // Hero: purple → blue
      { a: '#3b82f6', b: '#14b8a6' },   // About: blue → teal
      { a: '#14b8a6', b: '#ec4899' },   // Work: teal → pink
      { a: '#ec4899', b: '#f59e0b' },   // Contact: pink → gold
    ];
    const colorA = new THREE.Color();
    const colorB = new THREE.Color();
    const tmpA = new THREE.Color();
    const tmpB = new THREE.Color();

    // Animation loop
    const clock = new THREE.Clock();
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Smooth scroll & mouse
      scroll.smooth += (scroll.progress - scroll.smooth) * 0.08;
      mouse.x += (mouse.tx - mouse.x) * 0.05;
      mouse.y += (mouse.ty - mouse.y) * 0.05;

      const p = scroll.smooth;

      // Determine section and local progress
      const sectionCount = 4;
      const rawIdx = p * (sectionCount - 1);
      const idx = Math.min(Math.floor(rawIdx), sectionCount - 2);
      const localP = rawIdx - idx;

      // Interpolate colors
      tmpA.set(palette[idx].a);
      tmpB.set(palette[idx + 1].a);
      colorA.copy(tmpA).lerp(tmpB, localP);
      tmpA.set(palette[idx].b);
      tmpB.set(palette[idx + 1].b);
      colorB.copy(tmpA).lerp(tmpB, localP);

      // Update blob uniforms
      blobMat.uniforms.uTime.value = t;
      blobMat.uniforms.uMouse.value.set(mouse.x, mouse.y);
      blobMat.uniforms.uAmplitude.value = 0.3 + p * 0.4;
      blobMat.uniforms.uFrequency.value = 1.5 + Math.sin(p * Math.PI) * 0.8;
      blobMat.uniforms.uColorA.value.copy(colorA);
      blobMat.uniforms.uColorB.value.copy(colorB);

      // Blob movement per section
      blob.position.x = THREE.MathUtils.lerp(0, 3, Math.min(p * 3, 1))
        + THREE.MathUtils.lerp(0, -5, Math.max(0, Math.min((p - 0.33) * 3, 1)))
        + THREE.MathUtils.lerp(0, 2, Math.max(0, Math.min((p - 0.66) * 3, 1)));
      blob.position.y = Math.sin(p * Math.PI * 2) * 0.5;
      blob.scale.setScalar(1 - p * 0.15 + Math.sin(p * Math.PI) * 0.1);

      blob.rotation.y = t * 0.15 + mouse.x * 0.4;
      blob.rotation.x = t * 0.08 + mouse.y * 0.3;

      // Particles
      pMat.uniforms.uTime.value = t;
      particles.rotation.y = t * 0.015;
      particles.rotation.x = t * 0.008;

      renderer.render(scene, camera);
    };
    animate();

    // Loader hide
    setTimeout(() => {
      const loader = document.querySelector('.loader');
      if (loader) loader.classList.add('hidden');
    }, 1200);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      blobGeo.dispose();
      blobMat.dispose();
      pGeo.dispose();
      pMat.dispose();
    };
  }, []);

  // ── Lenis Smooth Scrolling ──
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    return () => lenis.destroy();
  }, []);

  // ── GSAP Text Animations ──
  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero entrance
      gsap.to('.hero-title .line-inner', {
        y: 0, duration: 1.2, stagger: 0.15, ease: 'power4.out', delay: 1.5,
      });
      gsap.to('.hero-eyebrow', { opacity: 1, duration: 1, delay: 2.2, ease: 'power2.out' });
      gsap.to('.hero-subtitle', { opacity: 1, y: 0, duration: 1, delay: 2.5, ease: 'power2.out' });
      gsap.to('.hero-scroll-hint', { opacity: 1, duration: 1, delay: 3, ease: 'power2.out' });

      // About — word-by-word reveal
      const words = document.querySelectorAll('.about-text .word');
      if (words.length) {
        ScrollTrigger.create({
          trigger: '.about',
          start: 'top 60%',
          end: 'bottom 40%',
          scrub: true,
          onUpdate: (self) => {
            const p = self.progress;
            words.forEach((w, i) => {
              const threshold = i / words.length;
              w.classList.toggle('active', p > threshold);
            });
          },
        });
      }

      // Skills stagger
      gsap.to('.skill-item', {
        opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out',
        scrollTrigger: { trigger: '.skills-row', start: 'top 80%' },
      });

      // Section labels
      gsap.utils.toArray('.section-label').forEach((el) => {
        gsap.from(el, {
          x: -30, opacity: 0, duration: 0.8, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 85%' },
        });
      });

      // Project items
      gsap.utils.toArray('.project-item').forEach((el, i) => {
        gsap.from(el, {
          y: 60, opacity: 0, duration: 0.8, delay: i * 0.1, ease: 'power2.out',
          scrollTrigger: { trigger: el, start: 'top 90%' },
        });
      });

      // Contact
      gsap.from('.contact-title', {
        y: 80, opacity: 0, duration: 1, ease: 'power3.out',
        scrollTrigger: { trigger: '.contact', start: 'top 70%' },
      });
      gsap.from('.contact-subtitle', {
        y: 40, opacity: 0, duration: 0.8, delay: 0.2, ease: 'power2.out',
        scrollTrigger: { trigger: '.contact', start: 'top 70%' },
      });
      gsap.from('.contact-link', {
        y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out',
        scrollTrigger: { trigger: '.contact-links', start: 'top 85%' },
      });
    });
    return () => ctx.revert();
  }, []);

  // ── Custom Cursor ──
  useEffect(() => {
    const dot = cursorDotRef.current;
    const ring = cursorRingRef.current;
    if (!dot || !ring) return;
    const onMove = (e) => {
      gsap.to(dot, { x: e.clientX, y: e.clientY, duration: 0.1, ease: 'power2.out' });
      gsap.to(ring, { x: e.clientX, y: e.clientY, duration: 0.25, ease: 'power2.out' });
    };
    const hovers = document.querySelectorAll('a, .project-item, .contact-link');
    const onEnter = () => ring.classList.add('hovering');
    const onLeave = () => ring.classList.remove('hovering');
    hovers.forEach((el) => { el.addEventListener('mouseenter', onEnter); el.addEventListener('mouseleave', onLeave); });
    window.addEventListener('mousemove', onMove);
    return () => {
      window.removeEventListener('mousemove', onMove);
      hovers.forEach((el) => { el.removeEventListener('mouseenter', onEnter); el.removeEventListener('mouseleave', onLeave); });
    };
  }, []);

  // ── Loader bar animation ──
  useEffect(() => {
    const bar = document.querySelector('.loader-bar');
    if (bar) {
      let w = 0;
      const interval = setInterval(() => {
        w += Math.random() * 25 + 5;
        if (w > 100) w = 100;
        bar.style.width = w + '%';
        if (w >= 100) clearInterval(interval);
      }, 200);
    }
  }, []);

  const aboutText = "I'm a creative developer who builds immersive digital experiences at the intersection of design and technology. I believe the web should feel alive — every pixel, every interaction, every transition should tell a story.";
  const aboutWords = aboutText.split(' ');

  return (
    <>
      {/* Loader */}
      <div className="loader">
        <div className="loader-text">Loading Experience</div>
        <div className="loader-bar-track"><div className="loader-bar"></div></div>
      </div>

      {/* Noise overlay */}
      <div className="noise-overlay" />

      {/* Custom cursor */}
      <div className="cursor-dot" ref={cursorDotRef} />
      <div className="cursor-ring" ref={cursorRingRef} />

      {/* 3D Canvas */}
      <canvas ref={canvasRef} className="webgl" />

      {/* Navbar */}
      <nav className="navbar">
        <a href="#hero" className="nav-logo">AA</a>
        <div className="nav-links">
          <a href="#about">About</a>
          <a href="#work">Work</a>
          <a href="#contact">Contact</a>
        </div>
      </nav>

      {/* Content */}
      <div className="content-wrapper">
        <section className="hero" id="hero">
          <div className="hero-eyebrow">Creative Developer &amp; Designer</div>
          <h1 className="hero-title">
            <span className="line"><span className="line-inner">Amil</span></span>
            <span className="line"><span className="line-inner accent">Abbasov</span></span>
          </h1>
          <p className="hero-subtitle">Crafting immersive digital experiences through code, design, and motion.</p>
          <div className="hero-scroll-hint">
            <div className="scroll-line" />
            <span>Scroll to explore</span>
          </div>
        </section>

        <section className="about" id="about">
          <div className="section-label">01 — About</div>
          <p className="about-text">
            {aboutWords.map((word, i) => (
              <span key={i} className="word">{word}</span>
            ))}
          </p>
          <div className="skills-row">
            {['React', 'Next.js', 'Three.js', 'GSAP', 'TypeScript', 'Node.js', 'Figma', 'Motion Design'].map((s) => (
              <div key={s} className="skill-item">{s}</div>
            ))}
          </div>
        </section>

        <section className="work" id="work">
          <div className="section-label">02 — Selected Work</div>
          <div className="project-list">
            {[
              { name: 'Quantum Interface', tags: ['React', '3D', 'WebGL'] },
              { name: 'Nebula Dashboard', tags: ['Next.js', 'UI/UX'] },
              { name: 'Pulse Analytics', tags: ['TypeScript', 'Data Viz'] },
              { name: 'Aurora Platform', tags: ['Full Stack', 'Motion'] },
            ].map((proj) => (
              <div key={proj.name} className="project-item">
                <div className="project-name">{proj.name}</div>
                <div className="project-tags">
                  {proj.tags.map((tag) => <span key={tag} className="project-tag">{tag}</span>)}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="contact" id="contact">
          <div className="section-label">03 — Contact</div>
          <h2 className="contact-title">
            Let's Create<br /><span className="gradient-text">Something Amazing</span>
          </h2>
          <p className="contact-subtitle">Have a project in mind? Let's talk about how we can work together.</p>
          <div className="contact-links">
            <a href="mailto:amil@example.com" className="contact-link">Email</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="contact-link">GitHub</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="contact-link">LinkedIn</a>
            <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="contact-link">Twitter</a>
          </div>
        </section>
      </div>

      <footer className="footer">&copy; 2026 Amil Abbasov. Built with passion &amp; Three.js</footer>
    </>
  );
};

export default PortfolioApp;
