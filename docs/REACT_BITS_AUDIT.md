# React Bits audit — Workout Tracker Pro

Audited against the official React Bits index and the upstream source on 2026-09-21. React Bits is a copy-paste component collection, not a dependency to import wholesale. Its own repository documents four source variants and selective installation; this product therefore adds only `motion`, the runtime required by the retained metric primitive.

## Integrated

| React Bits primitive | Product use | Why | Mobile treatment |
| --- | --- | --- | --- |
| Count Up | Home training summary and Progress volume | Makes real totals arrive with legible, restrained momentum. | Starts only in view, honors reduced motion, no interval or canvas. |

The local adaptations retain the upstream component architecture and attribution while using Workout Tracker Pro tokens, icon path, semantics, and existing data. No mock data was introduced.

## Component decisions

### Material and navigation

| Component | Recommended product mapping | Decision |
| --- | --- | --- |
| Fluid Glass, Glass Surface, Glass Icons | Navigation, sheets, compact controls | Existing CSS material system is the lighter equivalent. The upstream Glass Surface creates an SVG displacement map and ResizeObserver per instance, so applying it to all mobile surfaces would be a regression. Keep it as a reference, not a runtime dependency. |
| Pill Nav, Dock | Five-item bottom navigation | Existing bottom dock follows this pattern but uses CSS transforms instead of the upstream GSAP hover-first implementation. Correct for touch and avoids GSAP. |
| Bubble Menu, Gooey Nav, Flowing Menu, Staggered Menu, Card Nav, Line Sidebar | Secondary/nav menus | Rejected: desktop/menu-first or hover-dependent. Contextual links and native-style sheets are clearer for training flows. |
| Glass Surface, Reflective Card, Spotlight Card, Border Glow | One featured action or PR moment | Use existing material hierarchy only on dominant training and completion surfaces. Do not use reflective/spotlight effects on ordinary lists. |
| Tilted Card, Pixel Card, Decay Card, Bounce Cards, Card Swap, Flying Posters, Chroma Grid, Dome Gallery, Model Viewer, Lanyard, Infinite Menu, Infinite Spiral | Marketing/gallery interaction | Rejected: not a serious fitness-product interaction or not mobile-efficient. |
| Carousel, Stack, Scroll Stack, Accordion Gallery, Masonry, Circular Gallery, Depth Carousel, Folder | History/progress browse | Evaluate only if history becomes media-rich. The current real-data timeline does not need a gesture-heavy gallery. |

### Controls and feedback

| Component | Recommended product mapping | Decision |
| --- | --- | --- |
| Morph Slider | Exercise media carousel | Rejected. It uses OGL/WebGL, GSAP, continuous frames, and image textures; inappropriate for a workout logger. |
| Elastic Slider, Wake Slider, Slosh Gauge, Comet Dial | RPE/RIR/rest range controls | Existing native range controls remain. These sources depend on `motion` plus additional icon packages and add more novelty than comprehension. Revisit only after usability research. |
| Counter | Metrics | Count Up is the more restrained implementation and is integrated. |
| Stepper, Option Wheel, Glide Select, Rubber Segment, Jelly Radio | Workout builder, split/picker controls | Retain simple tactile segmented and numeric controls. Option Wheel is too choice-heavy; Stepper can be evaluated for a future dedicated set editor. |
| Toggle, Squish Switch, Bell Toggle | Preferences/notifications | Existing toggle stays because it already matches the material system. Squish Switch is a future replacement candidate when the native and web control contract is unified. |
| Spring Check, Status Mark, Pulse Heart, Peek Rating | Set completion, sync/PR/RPE | Evaluated but deferred. Spring Check pulls the full motion runtime into the active workout route for a single icon; the existing accessible completion control is lighter. Status Mark is a good future sync-state primitive once the web UI exposes durable per-operation status. Pulse Heart and Peek Rating are not used: they would imply data/feedback the product does not currently own. |
| Toast, Swipe Toast, Swipe Row, Hold Button, Sling Button, Slide Commit, Warm Tooltip, Fuse Button | Recoverable actions, tips, destructive confirmations | Useful future additions, but deferred until a single app-level toast/action contract exists. No new transient UI should conceal existing persistence errors. |

### AI, loading, and text

| Component | Recommended product mapping | Decision |
| --- | --- | --- |
| Prompt Bar, Voice Pill, Call Chip, Thought Line | Coach composer and optional voice | Existing authenticated composer remains authoritative. Prompt Bar adds model/source controls that are misleading for this constrained AI product; Voice Pill is deferred until actual voice capture exists. |
| Lattice Loader, Status Mark, Animated Content, Fade Content, Gradual Blur | AI/nutrition loading | Existing skeleton, scan HUD, and coach activity states already communicate loading without a new dependency. Gradual Blur imports extra math/runtime work and should not run across the app. |
| Blur Text, Split Text, Scroll Reveal, Fade Content, Scroll Float | One-off editorial entrance | Existing CSS page entrance is intentionally used instead. Do not animate live training numbers and instructions as prose. |
| Count Up | Real metrics | Integrated. |
| Text Loop, Shiny Text, Gradient Text, True Focus, Rotating Text, Text Type, Variable Proximity | Coach/contextual copy | Excluded from core screens: they create movement without new information. Text Loop is a possible future coach empty-state accent. |
| Masked Heading, Particle Text, Split Flap, Warp, Stroke, Depth, Fold, Echo, Circular, Fuzzy, Falling, Cursor, Decrypted, ASCII, Scrambled, Glitch, Scroll Velocity | Campaign/marketing copy | Rejected: harms readability or does not fit Stitch/Apple restraint. |

### Backgrounds and visual effects

| Component | Recommended product mapping | Decision |
| --- | --- | --- |
| Soft Aurora, Silk, Grainient, Light Rays, Lightfall | Calm environmental canvas | Existing CSS ambient light fields are the low-cost equivalent. Upstream Soft Aurora/Silk use OGL/WebGL and continuous animation; do not add them to a mid-range Android product. |
| Shape Blur, Gradual Blur, Noise | Surface polish | Existing static blur/noise-free material layers are sufficient and preserve text contrast. |
| Gradient Waves, Shape Waves, Floating Lines, Side Rays, Light Pillar, Topography, Dot Grid, Dot Field, Waves, Iridescence | Limited decorative surfaces | Deferred; none improves comprehension in the current data flows. |
| Liquid Chrome, Liquid Ether, Prism, Prismatic Burst, Aurora, Plasma, Ferrofluid, Beams, Threads, Hyperspeed, Ballpit, Orb, Galaxy, Grid Motion, Grid Distortion, Pixel Blast, Pixel Snow, Lightning, Radar, Scanner, CRT Warp, Dither, Faulty Terminal, Acid Squares, Balatro, Web Threads, Ghost Fibers, Aero Shards, Dark Veil, Color Bends, Evil Eye, Line Waves, Sliced Waves, Light Tunnel, Gradient Blinds, Ripple Grid, Shape Grid, Meta Balls | Promotional backgrounds | Rejected: WebGL/canvas, continuous CPU/GPU work, poor accessibility contrast, or a visual language incompatible with a calm training product. |

### Other animation effects

`Glow Cursor`, `Cursor Grid`, `Target Cursor`, `Ghost Cursor`, `Blob Cursor`, `Splash Cursor`, `Image Trail`, `Pixel Trail`, `Magnet`, `Magnet Lines`, `Click Spark`, `Star Border`, `Electric Border`, `Antigravity`, `Laser Flow`, `Metallic Paint`, `Ribbons`, `Cubes`, `Orbit Images`, `Pixel Transition`, `Pixel Swap`, `Ripple Distortion`, `Elastic Mesh`, `Halftone Reveal`, `Shape Blur`, `Noise`, and `Sticker Peel` were evaluated and excluded. They are pointer/desktop-first, disruptive, or expensive relative to their product value.

## Motion contract

| Need | Treatment |
| --- | --- |
| Press | 120–200ms compression, no overshoot. |
| Set completion | Existing CSS confirmation with transform/colour only; no route-level animation runtime. |
| Metric emphasis | Count Up: 720ms, in-view only. |
| Page and sheet | Existing `--spring-out` CSS token; transform/opacity only. |
| Loading | Layout-matched shimmer or scan HUD, never fake results. |
| Reduced motion | `motion` hooks and the product’s `prefers-reduced-motion` rule stop animation. |

## Performance guardrails

- One new tree-shakeable runtime: `motion`; no `gsap`, `ogl`, `three`, or icon-pack dependency.
- No pointer-following effects, image texture downloads, WebGL canvases, autoplaying carousels, or continuous scene animation.
- Motion mounts only on the metrics and controls that need it.
- React Bits remains a selective implementation reference rather than a visual theme. Stitch typography, spacing, exercise artwork, and material tokens remain authoritative.
