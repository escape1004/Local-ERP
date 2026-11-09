import React from "react"
import { CheckCircle2, Copy, TriangleAlert } from "lucide-react"

import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip"

export function Toaster() {
  const { toasts } = useToast()
  const [copied, setCopied] = React.useState(false)

  const getToastMeta = (variant?: string) => {
    if (variant === "destructive") {
      return {
        icon: TriangleAlert,
        iconClassName: "text-[#ff8f95]",
      }
    }

    return {
      icon: CheckCircle2,
      iconClassName: "text-[#8ea1ff]",
    }
  }

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, variant, ...props }) => {
        const meta = getToastMeta(variant)
        const Icon = meta.icon
        const hasDescription = Boolean(description)

        return (
          <Toast key={id} variant={variant} {...props}>
            <div className={`flex min-w-0 flex-1 gap-3 ${hasDescription ? "items-start" : "items-center"}`}>
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#454a53] bg-[#202225] group-[.destructive]:border-[#7a3539] group-[.destructive]:bg-[#2b1719] ${hasDescription ? "mt-0.5" : ""}`}>
                <Icon className={`h-4 w-4 ${meta.iconClassName}`} />
              </div>
              <div className={`min-w-0 flex-1 ${hasDescription ? "grid gap-1.5" : "flex min-h-9 items-center"}`}>
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <div className="flex min-w-0 items-center gap-1.5">
                    <ToastDescription className="min-w-0 flex-1 break-all">
                      {description}
                    </ToastDescription>
                    {typeof description === "string" && (
                      <>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="shrink-0 p-0.5 text-[#8b949e] transition-colors hover:text-white"
                                onClick={() => handleCopy(description)}
                              >
                                <Copy size={14} />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" align="center">
                              메시지 복사
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        {copied && <span className="text-[11px] font-medium text-[#8ea1ff]">복사됨</span>}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className={`flex shrink-0 items-center gap-2 ${hasDescription ? "self-start pt-0.5" : "min-h-9"}`}>
              {action}
            </div>
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
