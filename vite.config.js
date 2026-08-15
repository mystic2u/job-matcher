import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base must match the repo name exactly, GitHub Pages serves project
// sites from username.github.io/repo-name/, not the domain root.
export default defineConfig({
  plugins: [react()],
  base: "/job-matcher/",
});
