<script lang="ts">
  import { createViewer } from "@open-file-viewer/core";
  import type {
    FileViewer,
    PreviewOptions,
    PreviewToolbarRenderContext
  } from "@open-file-viewer/core";
  import { afterUpdate, onMount } from "svelte";

  export let file: PreviewOptions["file"] = undefined;
  export let files: PreviewOptions["files"] = undefined;
  export let fileName: PreviewOptions["fileName"] = undefined;
  export let mimeType: PreviewOptions["mimeType"] = undefined;
  export let width: PreviewOptions["width"] = "100%";
  export let height: PreviewOptions["height"] = "600px";
  export let fit: PreviewOptions["fit"] = "contain";
  export let plugins: PreviewOptions["plugins"] = [];
  export let toolbar: PreviewOptions["toolbar"] = false;
  export let theme: PreviewOptions["theme"] = "light";
  export let fallback: PreviewOptions["fallback"] = "inline";
  export let locale: PreviewOptions["locale"] = undefined;
  export let messages: PreviewOptions["messages"] = undefined;
  export let renderFallback: PreviewOptions["renderFallback"] = undefined;
  export let className: string | undefined = undefined;
  export let onLoad: PreviewOptions["onLoad"] = undefined;
  export let onError: PreviewOptions["onError"] = undefined;
  export let onUnsupported: PreviewOptions["onUnsupported"] = undefined;
  export let renderToolbar: ((ctx: PreviewToolbarRenderContext) => HTMLElement | void) | undefined = undefined;

  let container: HTMLDivElement;
  let viewer: FileViewer | null = null;
  let toolbarMount: HTMLElement | undefined;
  let toolbarSlotHost: HTMLDivElement | undefined;
  let toolbarContext: PreviewToolbarRenderContext | undefined;
  let mounted = false;
  let previousDeps: unknown[] = [];

  function destroyToolbarMount() {
    toolbarContext = undefined;
    toolbarMount = undefined;
  }

  function buildToolbar(): PreviewOptions["toolbar"] {
    if ($$slots.toolbar) {
      return {
        ...(typeof toolbar === "object" ? toolbar : {}),
        render(ctx) {
          toolbarContext = ctx;
          toolbarMount = document.createElement("div");
          toolbarMount.className = "ofv-svelte-toolbar";
          return toolbarMount;
        }
      };
    }

    if (renderToolbar) {
      return {
        ...(typeof toolbar === "object" ? toolbar : {}),
        render: renderToolbar
      };
    }

    return toolbar;
  }

  function getDeps(): unknown[] {
    return [
      file,
      files,
      fileName,
      mimeType,
      width,
      height,
      fit,
      plugins,
      toolbar,
      theme,
      fallback,
      locale,
      messages,
      renderFallback,
      className,
      onLoad,
      onError,
      onUnsupported,
      renderToolbar,
      Boolean($$slots.toolbar)
    ];
  }

  function depsChanged(nextDeps: unknown[]): boolean {
    return nextDeps.length !== previousDeps.length || nextDeps.some((value, index) => !Object.is(value, previousDeps[index]));
  }

  function syncToolbarSlot() {
    if (!toolbarMount || !toolbarSlotHost || toolbarSlotHost.parentElement === toolbarMount) {
      return;
    }
    toolbarMount.append(toolbarSlotHost);
  }

  function mountViewer() {
    if (!container) {
      return;
    }

    destroyToolbarMount();
    viewer?.destroy();
    viewer = createViewer({
      container,
      file,
      files,
      fileName,
      mimeType,
      width,
      height,
      fit,
      plugins,
      toolbar: buildToolbar(),
      theme,
      fallback,
      locale,
      messages,
      renderFallback,
      className,
      onLoad,
      onError,
      onUnsupported
    });
  }

  onMount(() => {
    mounted = true;
    previousDeps = getDeps();
    mountViewer();

    return () => {
      destroyToolbarMount();
      viewer?.destroy();
      viewer = null;
    };
  });

  afterUpdate(() => {
    syncToolbarSlot();
    if (!mounted) {
      return;
    }
    const nextDeps = getDeps();
    if (depsChanged(nextDeps)) {
      previousDeps = nextDeps;
      mountViewer();
    }
  });

</script>

<div bind:this={container} class={className}></div>

{#if toolbarMount && toolbarContext}
  <div bind:this={toolbarSlotHost} class="ofv-svelte-toolbar-content">
    <slot name="toolbar" ctx={toolbarContext}></slot>
  </div>
{/if}
