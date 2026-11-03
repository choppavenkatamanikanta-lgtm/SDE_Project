import "./style.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { HomePage } from "./routes/index";

const rootRoute = createRootRoute({ component: HomePage });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomePage });
const routeTree = rootRoute.addChildren([indexRoute]);
const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>,
);
