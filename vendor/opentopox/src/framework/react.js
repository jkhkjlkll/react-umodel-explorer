import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { NewTopoGraph } from "./NewTopoGraph.js";

/**
 * React lifecycle adapter for OpenTopoX.
 *
 * The core framework stays framework-agnostic. This optional adapter only runs
 * when consumers explicitly import `opentopox/react`.
 */
export const OpenTopoXGraph = forwardRef(function OpenTopoXGraph(
  {
    GraphClass = NewTopoGraph,
    className = "",
    style,
    containerClassName = "",
    containerStyle,
    config = {},
    layout,
    nodeType,
    data,
    autoFit,
    preserveViewport,
    onLoad,
    onGraphReady,
    onViewportChange,
    onNodeClick,
    onEdgeClick,
    onCanvasClick,
    onError,
    renderAddNodeModal,
    onDeleteNode,
    children,
  },
  ref,
) {
  const wrapperRef = useRef(null);
  const hostRef = useRef(null);
  const topoRef = useRef(null);
  const graphRef = useRef(null);
  const callbacksRef = useRef({});

  callbacksRef.current = {
    onLoad,
    onGraphReady,
    onViewportChange,
    onNodeClick,
    onEdgeClick,
    onCanvasClick,
    onError,
    renderAddNodeModal,
    onDeleteNode,
  };

  useImperativeHandle(ref, () => ({
    getTopo: () => topoRef.current,
    getGraph: () => graphRef.current,
    getContainer: () => hostRef.current,
    fitView: (options) => graphRef.current?.fitView(options),
    setData: (nextData) => graphRef.current?.setData(nextData),
    setLayout: (nextLayout, nextNodeType) => graphRef.current?.setLayout(nextLayout, nextNodeType),
    setViewport: (viewport) => graphRef.current?.setViewport(viewport),
    refreshMeasurements: () => graphRef.current?.refreshMeasurements(),
    destroy: () => topoRef.current?.destroy(),
  }), []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    try {
      const topo = new GraphClass({
        container: host,
        config,
        style,
        className,
        onLoad: (...args) => callbacksRef.current.onLoad?.(...args),
        handleNodeClick: (...args) => callbacksRef.current.onNodeClick?.(...args),
        handleEdgeClick: (...args) => callbacksRef.current.onEdgeClick?.(...args),
        handleCloseInfo: (...args) => callbacksRef.current.onCanvasClick?.(...args),
        renderAddNodeModal: (...args) => callbacksRef.current.renderAddNodeModal?.(...args),
        onDeleteNode: (...args) => callbacksRef.current.onDeleteNode?.(...args),
      });

      topoRef.current = topo;
      graphRef.current = topo.getGraph();
      const handleViewportChange = (event) => {
        callbacksRef.current.onViewportChange?.(event.detail);
      };
      host.addEventListener("topo:viewport", handleViewportChange);
      callbacksRef.current.onGraphReady?.({
        topo,
        graph: graphRef.current,
        container: host,
      });

      topo.__reactViewportCleanup = () => {
        host.removeEventListener("topo:viewport", handleViewportChange);
      };
    } catch (error) {
      callbacksRef.current.onError?.(error);
      if (!callbacksRef.current.onError) throw error;
    }

    return () => {
      topoRef.current?.__reactViewportCleanup?.();
      topoRef.current?.destroy();
      topoRef.current = null;
      graphRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!graphRef.current || !layout) return;
    graphRef.current.setLayout(layout, nodeType);
  }, [layout, nodeType]);

  useEffect(() => {
    const graph = graphRef.current;
    if (!graph || !data) return undefined;
    let cancelled = false;
    const nextData = {
      ...data,
      ...(autoFit == null ? null : { autoFit }),
      ...(preserveViewport == null ? null : { preserveViewport }),
    };

    Promise.resolve(graph.setData(nextData)).catch((error) => {
      if (cancelled) return;
      callbacksRef.current.onError?.(error);
      if (!callbacksRef.current.onError) throw error;
    });

    return () => {
      cancelled = true;
    };
  }, [data, autoFit, preserveViewport]);

  return React.createElement(
    "div",
    {
      ref: wrapperRef,
      className: containerClassName,
      style: containerStyle,
      "data-opentopox-react": "true",
    },
    React.createElement("div", {
      ref: hostRef,
      className: "opentopox-react-host",
      style: { width: "100%", height: "100%" },
    }),
    children,
  );
});

export function useOpenTopoXGraph() {
  const ref = useRef(null);
  return {
    ref,
    getTopo: () => ref.current?.getTopo() || null,
    getGraph: () => ref.current?.getGraph() || null,
    fitView: (options) => ref.current?.fitView(options),
    setData: (data) => ref.current?.setData(data),
    setLayout: (layout, nodeType) => ref.current?.setLayout(layout, nodeType),
    setViewport: (viewport) => ref.current?.setViewport(viewport),
    refreshMeasurements: () => ref.current?.refreshMeasurements(),
  };
}
