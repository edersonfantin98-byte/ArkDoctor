"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type SignaturePadLib from "signature_pad";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, { className?: string }>(
  function SignaturePad({ className }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePadLib | null>(null);

    useEffect(() => {
      let disposed = false;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);

      void import("signature_pad").then(({ default: Lib }) => {
        if (disposed || !canvasRef.current) return;
        padRef.current = new Lib(canvasRef.current, { penColor: "#111827" });
      });

      return () => {
        disposed = true;
        padRef.current?.off();
        padRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
      clear: () => padRef.current?.clear(),
    }));

    return <canvas ref={canvasRef} className={className} />;
  },
);
