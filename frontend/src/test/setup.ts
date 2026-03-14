import "@testing-library/jest-dom";

// jsdom does not implement URL.createObjectURL; maplibre-gl and similar libs need it at load time
if (typeof globalThis.URL !== "undefined" && !globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = function () {
    return "blob:test-mock-url";
  };
  globalThis.URL.revokeObjectURL = function () {};
}
