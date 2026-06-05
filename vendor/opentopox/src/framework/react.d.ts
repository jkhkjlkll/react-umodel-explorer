import type { CSSProperties, ReactNode, RefObject } from "react";
import type {
  NewTopoGraph,
  TopologyGraphData,
  TopologyNode,
  TopologyEdge,
  TopologyViewport,
} from "./index.js";

export interface OpenTopoXGraphReadyPayload {
  topo: NewTopoGraph;
  graph: ReturnType<NewTopoGraph["getGraph"]>;
  container: HTMLDivElement;
}

export interface OpenTopoXGraphHandle {
  getTopo(): NewTopoGraph | null;
  getGraph(): ReturnType<NewTopoGraph["getGraph"]> | null;
  getContainer(): HTMLDivElement | null;
  fitView(options?: Record<string, unknown>): void;
  setData(data: TopologyGraphData & Record<string, unknown>): Promise<unknown> | unknown;
  setLayout(layout: Record<string, unknown>, nodeType?: string): unknown;
  setViewport(viewport: Partial<TopologyViewport>): unknown;
  refreshMeasurements(): boolean | undefined;
  destroy(): void;
}

export interface OpenTopoXGraphProps {
  GraphClass?: typeof NewTopoGraph;
  className?: string;
  style?: Record<string, unknown>;
  containerClassName?: string;
  containerStyle?: CSSProperties;
  config?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  nodeType?: string;
  data?: TopologyGraphData & Record<string, unknown>;
  autoFit?: boolean;
  preserveViewport?: boolean;
  onLoad?: (...args: unknown[]) => void;
  onGraphReady?: (payload: OpenTopoXGraphReadyPayload) => void;
  onViewportChange?: (viewport: TopologyViewport) => void;
  onNodeClick?: (node: TopologyNode) => void;
  onEdgeClick?: (edge: TopologyEdge) => void;
  onCanvasClick?: (...args: unknown[]) => void;
  onError?: (error: unknown) => void;
  renderAddNodeModal?: (...args: unknown[]) => unknown;
  onDeleteNode?: (...args: unknown[]) => void;
  children?: ReactNode;
}

export const OpenTopoXGraph: import("react").ForwardRefExoticComponent<
  OpenTopoXGraphProps & import("react").RefAttributes<OpenTopoXGraphHandle>
>;

export interface UseOpenTopoXGraphResult {
  ref: RefObject<OpenTopoXGraphHandle>;
  getTopo(): NewTopoGraph | null;
  getGraph(): ReturnType<NewTopoGraph["getGraph"]> | null;
  fitView(options?: Record<string, unknown>): void;
  setData(data: TopologyGraphData & Record<string, unknown>): Promise<unknown> | unknown;
  setLayout(layout: Record<string, unknown>, nodeType?: string): unknown;
  setViewport(viewport: Partial<TopologyViewport>): unknown;
  refreshMeasurements(): boolean | undefined;
}

export function useOpenTopoXGraph(): UseOpenTopoXGraphResult;
