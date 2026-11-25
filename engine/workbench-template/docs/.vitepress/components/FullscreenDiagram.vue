<template>
  <div class="diagram-container">
    <div class="diagram" ref="diagramRef">
      <slot></slot>
    </div>
    <button class="expand-btn" @click="toggleExpand" :title="isExpanded ? 'Close' : 'Expand'">
      <svg v-if="!isExpanded" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
        <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
      </svg>
    </button>

    <Teleport to="body">
      <div v-if="isExpanded" class="modal-overlay" @click.self="toggleExpand">
        <div class="modal-content">
          <div class="expanded-diagram">
            <div ref="expandedDiagramRef" v-html="diagramHTML"></div>
          </div>
          <div class="zoom-controls">
            <button @click="zoomOut" :disabled="zoom <= 0.05" title="Zoom Out">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 13H5v-2h14v2z"/>
              </svg>
            </button>
            <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
            <button @click="zoomIn" :disabled="zoom >= 3" title="Zoom In">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </button>
            <button @click="resetZoom" title="Reset Zoom">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                <path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              </svg>
            </button>
          </div>
          <button class="close-btn" @click="toggleExpand">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
              <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import panzoom from "panzoom";
import { nextTick, ref, watch } from "vue";

const isExpanded = ref(false);
const diagramRef = ref(null);
const expandedDiagramRef = ref(null);
const zoom = ref(1);
const panzoomInstance = ref(null);
const diagramHTML = ref("");

const cloneDiagram = () => {
	if (!diagramRef.value) return;
	diagramHTML.value = diagramRef.value.innerHTML;
};

// IMPORTANT: handler names must NOT be prefixed with `_`. The template binds
// to `toggleExpand` / `zoomIn` / `zoomOut`; an underscore prefix makes Vue
// resolve those bindings to undefined → silent no-op on click. ESLint's
// `no-unused-vars` with `argsIgnorePattern: "^_"` may try to auto-fix these
// as "unused" because the linter can't see template references — turn off
// `no-unused-vars` for `<script setup>` blocks, or enable
// `vue/no-unused-properties` so the parser counts template references as uses.
const toggleExpand = () => {
	if (!isExpanded.value) {
		cloneDiagram();
	}
	isExpanded.value = !isExpanded.value;
	if (isExpanded.value) {
		document.body.style.overflow = "hidden";
		nextTick(() => {
			if (expandedDiagramRef.value) {
				const svgElement =
					expandedDiagramRef.value.querySelector("svg") || expandedDiagramRef.value.firstChild;
				if (svgElement) {
					panzoomInstance.value = panzoom(svgElement, {
						// `bounds: true` + `boundsPadding: 0.1` silently locks panning when
						// the rendered SVG roughly fills the modal — drag does nothing.
						// Figma/Miro convention is unbounded panning with a reset button.
						bounds: false,
						minZoom: 0.05,
						maxZoom: 10,
						// Wheel-to-pan with Cmd/Ctrl-wheel-to-zoom — panzoom's default
						// (wheel-to-zoom) feels wrong for diagram viewers. Returning
						// `false` from `beforeWheel` aborts panzoom's wheel handler so
						// our custom logic runs instead.
						beforeWheel(e) {
							if (e.ctrlKey || e.metaKey) {
								// Let panzoom handle zoom — return falsy so it proceeds.
								return false;
							}
							// Plain wheel = pan. Move by the wheel delta and abort the
							// default zoom path.
							e.preventDefault();
							panzoomInstance.value?.moveBy(-e.deltaX, -e.deltaY, false);
							return true;
						},
					});
					panzoomInstance.value.on("zoom", () => {
						zoom.value = panzoomInstance.value.getTransform().scale;
					});
				}
			}
		});
	} else {
		document.body.style.overflow = "";
		if (panzoomInstance.value) {
			panzoomInstance.value.dispose();
			panzoomInstance.value = null;
		}
		resetZoom();
	}
};

const zoomIn = () => {
	if (panzoomInstance.value) {
		const currentZoom = panzoomInstance.value.getTransform().scale;
		if (currentZoom < 10) {
			panzoomInstance.value.smoothZoom(0, 0, 1.1);
		}
	}
};

const zoomOut = () => {
	if (panzoomInstance.value) {
		const currentZoom = panzoomInstance.value.getTransform().scale;
		if (currentZoom > 0.05) {
			panzoomInstance.value.smoothZoom(0, 0, 0.9);
		}
	}
};

const resetZoom = () => {
	if (panzoomInstance.value) {
		panzoomInstance.value.zoomAbs(0, 0, 1);
		panzoomInstance.value.moveTo(0, 0);
	}
};

watch(isExpanded, (newValue) => {
	if (!newValue) {
		resetZoom();
	}
});
</script>

<style scoped>
.diagram-container {
  position: relative;
  width: 100%;
}

.diagram {
  width: 100%;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}

.expand-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  opacity: 0.9;
  transition: opacity 0.2s;
  z-index: 10;
  color: var(--vp-c-text-1);
}

.expand-btn:hover {
  opacity: 1;
  background: var(--vp-c-bg-soft);
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  position: relative;
  background: var(--vp-c-bg);
  padding: 2rem;
  border-radius: 8px;
  width: 95vw;
  height: 95vh;
  display: flex;
  flex-direction: column;
}

.expanded-diagram {
  flex: 1;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expanded-diagram > div {
  cursor: move;
}

.expanded-diagram :deep(svg) {
  display: block;
  width: auto;
  height: auto;
  min-width: 1000px;
  max-width: 90%;
  max-height: 90%;
  margin: auto;
}

.expanded-diagram :deep(.mermaid) {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
}

.zoom-controls {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--vp-c-bg);
  padding: 0.5rem;
  border-radius: 8px;
  border: 1px solid var(--vp-c-divider);
}

.zoom-controls button {
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  color: var(--vp-c-text-1);
}

.zoom-controls button:hover {
  opacity: 1;
}

.zoom-controls button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.zoom-level {
  min-width: 4rem;
  text-align: center;
  font-size: 0.9rem;
  color: var(--vp-c-text-2);
}

.close-btn {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 4px;
  padding: 8px;
  cursor: pointer;
  opacity: 0.7;
  transition: opacity 0.2s;
  z-index: 10;
  color: var(--vp-c-text-1);
}

.close-btn:hover {
  opacity: 1;
}
</style>
