import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIMITS, errorsUnder } from "./contentOptions";
import type { CaseStudyKeyResult } from "@/types";

interface KeyResultsFieldProps {
  value: CaseStudyKeyResult[];
  onChange: (value: CaseStudyKeyResult[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}

// Headline numbers
export default function KeyResultsField({ value, onChange, errors, disabled }: KeyResultsFieldProps) {
  function setAt(index: number, patch: Partial<CaseStudyKeyResult>) {
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2" data-error-key="keyResults">
      <Label>Key results</Label>
      {value.map((row, index) => (
        <div key={index} className="space-y-1">
          <div className="flex gap-2">
            <Input
              className="w-28"
              placeholder="8°C"
              maxLength={20}
              value={row.value}
              disabled={disabled}
              aria-label={`Key result ${index + 1} value`}
              onChange={(e) => setAt(index, { value: e.target.value })}
            />
            <Input
              placeholder="cooler on the shop floor"
              maxLength={60}
              value={row.label}
              disabled={disabled}
              aria-label={`Key result ${index + 1} label`}
              onChange={(e) => setAt(index, { label: e.target.value })}
            />
            {!disabled && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Remove key result"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
          {errorsUnder(errors, `keyResults.${index}`).map((message) => (
            <p key={message} className="text-xs text-destructive">
              {message}
            </p>
          ))}
        </div>
      ))}
      {!disabled && value.length < LIMITS.keyResults && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { value: "", label: "" }])}>
          <Plus className="mr-2 h-4 w-4" />
          Add key result
        </Button>
      )}
      {errors.keyResults && <p className="text-xs text-destructive">{errors.keyResults}</p>}
    </div>
  );
}
