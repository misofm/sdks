// hls.js ships types for its main entry only. The light build exports the same
// default class, so alias its declaration for the lazy runtime import.
declare module "hls.js/light" {
  export { default } from "hls.js";
}
