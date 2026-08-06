// E3 T5 — DESIGN_SYSTEM.md §4's Forms category: text input, textarea,
// select, checkbox, radio, switch, combobox, all wired through FormField's
// label/help-text/error-text slots. Select/Checkbox/RadioGroup/Switch/Label
// are T3's themed Radix primitives (packages/ui/src/components/ui/*),
// re-exported here so a Forms consumer never needs to reach into `ui/`
// directly for a plain form control.
export { FormField, type FormFieldProps } from './form-field';
export { useFormFieldContext, type FormFieldContextValue } from './form-field-context';
export { Input, type InputProps } from './input';
export { Textarea, type TextareaProps } from './textarea';
export { Combobox, type ComboboxProps } from './combobox';

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
} from '../ui/select';
export { Checkbox } from '../ui/checkbox';
export { RadioGroup, RadioGroupItem } from '../ui/radio-group';
export { Switch } from '../ui/switch';
export { Label } from '../ui/label';
