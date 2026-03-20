import "@testing-library/jest-dom/vitest";

const noop = () => undefined;

const createMock2dContext = () => {
  const gradient = { addColorStop: noop };
  return {
    setTransform: noop,
    clearRect: noop,
    save: noop,
    beginPath: noop,
    arc: noop,
    closePath: noop,
    clip: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    drawImage: noop,
    fillRect: noop,
    createLinearGradient: () => gradient,
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
};

if (typeof HTMLCanvasElement !== "undefined") {
  const p = HTMLCanvasElement.prototype as unknown as {
    getContext?: (type: string) => unknown;
    toDataURL?: (...args: unknown[]) => string;
  };

  if (!p.getContext) {
    p.getContext = () => createMock2dContext();
  } else {
    const orig = p.getContext.bind(HTMLCanvasElement.prototype);
    p.getContext = (type: string) => {
      if (type === "2d") return createMock2dContext();
      return orig(type) as unknown;
    };
  }

  if (!p.toDataURL) {
    p.toDataURL = () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5zBvQAAAAASUVORK5CYII=";
  }
}
