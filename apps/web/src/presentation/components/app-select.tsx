"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@open-file/ui/components/select"

interface AppSelectProps {
  id?: string
  "aria-label"?: string
  value: string
  onValueChange?: (value: string) => void
  disabled?: boolean
  className?: string
  options: { value: string; label: string; disabled?: boolean }[]
}

export function AppSelect({
  id,
  "aria-label": label,
  value,
  onValueChange,
  disabled,
  className,
  options,
}: AppSelectProps) {
  return (
    <Select
      value={value}
      items={options}
      disabled={disabled}
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next)
      }}
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.disabled}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
