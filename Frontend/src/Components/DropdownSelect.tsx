import React, { useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';

export interface DropdownItem {
  value: string;
  label: React.ReactNode;
}

interface DropdownSelectProps {
  items: DropdownItem[];
  value: string | undefined;
  onChange: (value: string) => void;
  placeholder?: React.ReactNode;
  buttonClassName?: string;
  menuClassName?: string;
  itemClassName?: string;
  disabled?: boolean;
  align?: 'start' | 'end';
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

export default function DropdownSelect({
  items,
  value,
  onChange,
  placeholder = 'Select',
  buttonClassName,
  menuClassName,
  // ✅ use important prefix BEFORE the utility (`!text-primary`)
  itemClassName = 'justify-start text-sm font-medium hover:bg-white/5 rounded-md transition-all duration-200 hover:pl-3.5',
  disabled = false,
  align = 'end',
  size = 'md',
  ariaLabel,
}: DropdownSelectProps) {
  const selected = items.find((i) => i.value === value);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const [openDirection, setOpenDirection] = useState<'down' | 'up'>('down');
  const [menuMaxHeight, setMenuMaxHeight] = useState<number | undefined>();

  const computeMenuFit = React.useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const margin = 8;
    const viewportH = window.innerHeight;
    const spaceBelow = Math.max(0, viewportH - rect.bottom - margin);
    const spaceAbove = Math.max(0, rect.top - margin);
    let dir: 'down' | 'up' = 'down';
    let available = spaceBelow;
    if (spaceBelow < 140 && spaceAbove > spaceBelow) {
      dir = 'up';
      available = spaceAbove;
    }
    setOpenDirection(dir);
    setMenuMaxHeight(Math.min(260, Math.max(120, Math.floor(available - 8))));
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const handler = () => computeMenuFit();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [isOpen, computeMenuFit]);

  React.useEffect(() => {
    // Only listen while open. The settings page renders a dozen of these, and a closed
    // dropdown has nothing to dismiss.
    if (!isOpen) return;

    function onDocMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const openAndFocus = (index: number) => {
    computeMenuFit();
    setIsOpen(true);
    requestAnimationFrame(() => optionRefs.current[index]?.focus());
  };

  const sizeBtn = size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '';
  const computedMenuClassName =
    menuClassName ??
    `dropdown-content menu menu-md bg-base-300 border border-base-400 rounded-box z-[999] w-full p-2 ${openDirection === 'up' ? 'mb-1' : 'mt-1'} shadow flex-nowrap`;

  return (
    <div
      ref={containerRef}
      className={`dropdown w-full ${align === 'end' ? 'dropdown-end' : ''} ${openDirection === 'up' ? 'dropdown-top' : ''} ${isOpen ? 'dropdown-open' : ''}`}
    >
      {/* Trigger */}
      <button
        ref={buttonRef}
        type="button"
        aria-controls={menuId}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        className={buttonClassName ?? `btn border-base-400 w-full justify-between ${sizeBtn}`}
        onClick={() => {
          if (disabled) return;
          if (!isOpen) {
            computeMenuFit();
            setIsOpen(true);
          } else {
            setIsOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const selectedIndex = Math.max(
              0,
              items.findIndex((item) => item.value === value),
            );
            openAndFocus(event.key === 'ArrowUp' ? Math.max(items.length - 1, 0) : selectedIndex);
          }
        }}
      >
        <span className="flex-1 text-left truncate text-base-content font-medium">
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          aria-hidden
          className="ml-2 inline-flex items-center"
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
        >
          <ChevronDown size={20} />
        </motion.span>
      </button>

      {/* Menu (DaisyUI v5 structure) */}
      <ul
        id={menuId}
        role="listbox"
        aria-hidden={!isOpen}
        // The menu stays mounted while closed, so without this every option button
        // remains in the tab order (and focusable content inside aria-hidden is invalid).
        inert={!isOpen}
        className={computedMenuClassName}
        style={menuMaxHeight ? { maxHeight: `${menuMaxHeight}px`, overflowY: 'auto' } : undefined}
      >
        {items.map((item) => {
          const isActive = item.value === value;
          return (
            <li key={item.value} className="w-full">
              <button
                ref={(element) => {
                  optionRefs.current[items.indexOf(item)] = element;
                }}
                type="button"
                role="option"
                aria-selected={isActive}
                className={`${itemClassName} ${isActive ? 'active !text-primary' : 'text-base-content'} w-full whitespace-nowrap`}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => {
                  if (disabled) return;
                  onChange(item.value);
                  setIsOpen(false);
                  buttonRef.current?.focus();
                }}
                onKeyDown={(event) => {
                  const index = items.indexOf(item);
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const offset = event.key === 'ArrowDown' ? 1 : -1;
                    const next = (index + offset + items.length) % items.length;
                    optionRefs.current[next]?.focus();
                  } else if (event.key === 'Home') {
                    event.preventDefault();
                    optionRefs.current[0]?.focus();
                  } else if (event.key === 'End') {
                    event.preventDefault();
                    optionRefs.current[items.length - 1]?.focus();
                  }
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
