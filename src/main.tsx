import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/pt-serif/400.css";
import "@fontsource/pt-serif/400-italic.css";
import "@fontsource-variable/dm-sans";
import "./styles/global.css";
import "./styles/themes.css";
import { App } from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("#root is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
