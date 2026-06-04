import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, X, RotateCcw } from 'lucide-react';
import { useToolTimeCategories } from '@/hooks/useToolTimeCategories';

export default function ToolTimeCategoriesSettings() {
  const { groups, updateGroup, addSubcategory, removeSubcategory, resetToDefaults } = useToolTimeCategories();
  const [inputs, setInputs] = useState({});

  const setInput = (key, val) => setInputs(prev => ({ ...prev, [key]: val }));

  const handleAdd = (key) => {
    const val = (inputs[key] || '').trim();
    if (val) {
      addSubcategory(key, val);
      setInput(key, '');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">Tool Time Categories (DILO-FIT)</CardTitle>
          <Button variant="ghost" size="sm" onClick={resetToDefaults} className="gap-1.5 text-xs h-7">
            <RotateCcw className="w-3 h-3" /> Reset to defaults
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Edit group colours, labels, and subcategories used across the app.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {Object.entries(groups).map(([key, group]) => (
          <div key={key} className="space-y-2">
            {/* Group header: colour swatch + label + colour picker */}
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={group.color}
                onChange={e => updateGroup(key, { color: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer border border-border p-0"
                title="Change group colour"
              />
              <Input
                value={group.label}
                onChange={e => updateGroup(key, { label: e.target.value })}
                className="h-7 text-xs font-semibold w-52"
              />
            </div>

            {/* Subcategories */}
            <div className="flex flex-wrap gap-1.5 ml-8">
              {group.subcategories.map(sub => (
                <Badge
                  key={sub}
                  variant="outline"
                  className="gap-1 pr-1 text-[10px]"
                  style={{ borderColor: group.color, color: group.color }}
                >
                  {sub}
                  <button
                    onClick={() => removeSubcategory(key, sub)}
                    className="hover:text-destructive transition-colors ml-0.5"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </Badge>
              ))}
            </div>

            {/* Add subcategory */}
            <div className="flex gap-2 ml-8">
              <Input
                placeholder="Add subcategory…"
                value={inputs[key] || ''}
                onChange={e => setInput(key, e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd(key)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleAdd(key)}
                disabled={!(inputs[key] || '').trim()}
                className="h-7 px-2 gap-1 text-xs"
              >
                <Plus className="w-3 h-3" /> Add
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}