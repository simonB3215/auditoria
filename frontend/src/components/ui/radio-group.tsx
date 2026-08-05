"use client"

import * as React from "react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  )
}

/**
 * A diferencia del radio "punto" clásico, este item es pensado para
 * envolver una tarjeta completa (ver el selector de criticidad en
 * /assets) — el estilo de "seleccionado" se aplica vía `data-state` en el
 * propio contenedor en vez de un círculo aparte, para que toda la tarjeta
 * sea el hit target y quede claro visualmente cuál está activa.
 */
function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "cursor-pointer rounded-lg border border-input text-left outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary/5 data-[state=checked]:ring-1 data-[state=checked]:ring-primary",
        className
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
