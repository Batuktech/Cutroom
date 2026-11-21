import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * Styled replacement for a native <select>. Values are strings; convert numbers at the call site.
 * Wrap it in a <label> (or pass aria-label) exactly as with a native select: the trigger is a button,
 * so the label names it and clicking the label text opens the list.
 */
export function Select({
  value,
  onValueChange,
  children,
  disabled,
  required,
  placeholder,
  className,
  id,
  ...aria
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled} required={required}>
      <SelectPrimitive.Trigger id={id} className={cn("select-trigger", className)} {...aria}>
        <SelectPrimitive.Value placeholder={placeholder ?? "Choose…"} />
        <SelectPrimitive.Icon className="select-icon">
          <ChevronDown size={16} aria-hidden />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="select-content" position="popper" sideOffset={6} collisionPadding={12}>
          <SelectPrimitive.ScrollUpButton className="select-scroll">
            <ChevronUp size={14} aria-hidden />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="select-viewport">{children}</SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="select-scroll">
            <ChevronDown size={14} aria-hidden />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** One choice. `hint` adds a muted second line in the list only; the trigger shows just the label. */
export function SelectItem({
  value,
  children,
  hint,
  disabled,
}: {
  value: string;
  children: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <SelectPrimitive.Item value={value} disabled={disabled} className="select-item">
      <span className="select-item-text">
        <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
        {hint && <small>{hint}</small>}
      </span>
      <SelectPrimitive.ItemIndicator className="select-check">
        <Check size={15} aria-hidden />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

