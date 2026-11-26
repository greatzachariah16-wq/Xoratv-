/**
 * TypeScript entry shim for the deployed Cloudflare edge API.
 * The canonical, directly deployable runtime is ../worker.js.
 * Keep the Worker implementation in one place so the API source and
 * deployed JavaScript cannot drift apart.
 */
export { default } from "../worker.js";
