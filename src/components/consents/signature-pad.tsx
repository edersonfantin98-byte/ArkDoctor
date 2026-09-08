"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type SignaturePadLib from "signature_pad";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  { className?: string; onChange?: (isEmpty: boolean) => void }
>(function SignaturePad({ className, onChange }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let disposed = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resizeCanvas() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d")?.scale(ratio, ratio);
    }

    resizeCanvas();

    function onResize() {
      resizeCanvas();
      padRef.current?.clear();
      onChangeRef.current?.(true);
    }
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);

    void import("signature_pad").then(({ default: Lib }) => {
      if (disposed || !canvasRef.current) return;
      padRef.current = new Lib(canvasRef.current, { penColor: "#111827" });
      padRef.current.addEventListener("endStroke", () => {
        onChangeRef.current?.(padRef.current?.isEmpty() ?? true);
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      padRef.current?.off();
      padRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    isEmpty: () => padRef.current?.isEmpty() ?? true,
    toDataURL: () => padRef.current?.toDataURL("image/png") ?? "",
    clear: () => {
      padRef.current?.clear();
      onChangeRef.current?.(true);
    },
  }));

  return <canvas ref={canvasRef} className={className} />;
});
