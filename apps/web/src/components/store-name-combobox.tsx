"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

import {
  filterSuggestedStores,
  OTHER_STORE_LABEL,
  OTHER_STORE_VALUE,
  SUGGESTED_STORE_NAMES,
} from "@/lib/suggested-stores";
import { cn } from "@/lib/utils";

type StoreNameComboboxProps = {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  "aria-label"?: string;
};

/**
 * Combobox sklepu: sugestie + wyszukiwanie + własna nazwa + puste.
 * Zapisuje wyłącznie tekst do storeName (bez modelu Store).
 */
export function StoreNameCombobox({
  id,
  value,
  onChange,
  disabled = false,
  className,
  inputClassName,
  placeholder = "np. Lidl",
  "aria-label": ariaLabel = "Sklep",
}: StoreNameComboboxProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [otherMode, setOtherMode] = useState(() => {
    const trimmed = value.trim();
    return Boolean(
      trimmed &&
        !(SUGGESTED_STORE_NAMES as readonly string[]).includes(trimmed),
    );
  });
  const [highlight, setHighlight] = useState(0);

  const query = value;
  const suggestions = useMemo(() => filterSuggestedStores(query), [query]);

  const options = useMemo(() => {
    const rows: { value: string; label: string }[] = suggestions.map(
      (name) => ({ value: name, label: name }),
    );
    rows.push({ value: OTHER_STORE_VALUE, label: OTHER_STORE_LABEL });
    rows.push({ value: "", label: "Bez sklepu" });
    return rows;
  }, [suggestions]);

  const highlightIndex = open ? Math.min(highlight, options.length - 1) : 0;

  useEffect(() => {
    function onDocPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocPointer);
    return () => document.removeEventListener("mousedown", onDocPointer);
  }, []);

  function selectOption(optionValue: string) {
    if (optionValue === OTHER_STORE_VALUE) {
      setOtherMode(true);
      onChange("");
      setOpen(false);
      return;
    }
    setOtherMode(false);
    onChange(optionValue);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlight((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((index) => (index - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[highlight];
      if (option) {
        selectOption(option.value);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={otherMode ? "Wpisz nazwę sklepu" : placeholder}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          setHighlight(0);
          setOpen(true);
          if (
            next.trim() &&
            !(SUGGESTED_STORE_NAMES as readonly string[]).includes(next.trim())
          ) {
            setOtherMode(true);
          }
        }}
        onFocus={() => {
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={inputClassName}
      />
      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option, index) => (
            <li key={`${option.value}-${option.label}`} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={highlightIndex === index}
                className={cn(
                  "flex w-full px-3 py-2 text-left text-sm",
                  highlightIndex === index
                    ? "bg-emerald-50 text-emerald-900"
                    : "text-gray-800 hover:bg-gray-50",
                )}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => selectOption(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
