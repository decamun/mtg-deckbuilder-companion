"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/** Source-image crop: middle 85% horizontally; vertically 11%–55%; uniform scale to fill the pane. */
function computeArtPlacement(wrapW: number, wrapH: number, iw: number, ih: number) {
  const cropL = 0.075 * iw
  const cropT = 0.11 * ih
  const cropW = 0.85 * iw
  const cropH = 0.44 * ih
  const s = Math.max(wrapW / cropW, wrapH / cropH)
  const tw = iw * s
  const th = ih * s
  const tx = -cropL * s + (wrapW - cropW * s) / 2
  const ty = -cropT * s + (wrapH - cropH * s) / 2
  return { tw, th, tx, ty }
}

export function DeckWorkspaceDockCardArtPreview({ imageUrl, label }: { imageUrl: string | null; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [fit, setFit] = useState<{ tw: number; th: number; tx: number; ty: number } | null>(null)

  const recompute = useCallback(() => {
    const wrap = wrapRef.current
    const img = imgRef.current
    if (!wrap || !img?.naturalWidth) return
    const { clientWidth: ww, clientHeight: wh } = wrap
    if (ww < 2 || wh < 2) return
    const { tw, th, tx, ty } = computeArtPlacement(ww, wh, img.naturalWidth, img.naturalHeight)
    setFit({ tw, th, tx, ty })
  }, [])

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => {
      recompute()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [recompute])

  return (
    <div
      ref={wrapRef}
      className={cn(
        "pointer-events-none relative shrink-0 overflow-hidden rounded-lg border border-border/60 bg-zinc-100",
        "h-[7rem] w-[10.5rem]"
      )}
    >
      {imageUrl ? (
        <>
          <img
            ref={imgRef}
            src={imageUrl}
            alt={label ? `${label} art` : ""}
            className="absolute left-0 top-0 max-w-none select-none"
            draggable={false}
            onLoad={recompute}
            style={
              fit
                ? {
                    width: fit.tw,
                    height: fit.th,
                    transform: `translate(${fit.tx}px, ${fit.ty}px)`,
                  }
                : {
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "50% 33%",
                  }
            }
          />
          {/* 5% edge vignette on the art pane, centered on the crop window edges */}
          <div className="pointer-events-none absolute inset-0 z-[1]">
            <div className="absolute inset-x-0 top-0 h-[5%] bg-gradient-to-b from-black/50 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-[5%] bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute inset-y-0 left-0 w-[5%] bg-gradient-to-r from-black/50 to-transparent" />
            <div className="absolute inset-y-0 right-0 w-[5%] bg-gradient-to-l from-black/50 to-transparent" />
          </div>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-2 text-center text-xs italic text-muted-foreground">
          Hover a card for art
        </div>
      )}
    </div>
  )
}
