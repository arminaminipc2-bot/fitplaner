import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { bootFont } from "./lib/fonts";
import "./index.css";

bootFont();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
