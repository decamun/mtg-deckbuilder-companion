import { toast } from "sonner"

type AnyFn = (...args: unknown[]) => unknown

export function gateOwnerAction<T extends AnyFn>(isOwner: boolean, fn: T): T {
  return ((...args: Parameters<T>) => {
    if (!isOwner) {
      toast.error("Only the deck owner can do that")
      return
    }
    return fn(...args)
  }) as unknown as T
}
