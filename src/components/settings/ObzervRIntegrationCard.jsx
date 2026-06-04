import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Info } from 'lucide-react';

const getLS = (key) => { try { return localStorage.getItem(key) || ''; } catch { return ''; } };
const setLS = (key, val) => { try { localStorage.setItem(key, val); } catch {} };

export default function ObzervRIntegrationCard() {
  const [tenantId, setTenantId] = useState(() => getLS('obzervr_tenant_id'));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Info className="w-4 h-4" /> Obzervr Integration
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Tenant ID</label>
          <p className="text-xs text-muted-foreground">
            Found in Obzervr under Settings → Organisation → Tenant ID.
            Required so exported templates are linked to your tenant.
          </p>
          <Input
            value={tenantId}
            onChange={e => { setTenantId(e.target.value.trim()); setLS('obzervr_tenant_id', e.target.value.trim()); }}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="h-8 text-sm font-mono"
          />
          {!tenantId && (
            <p className="text-xs text-destructive">
              ⚠ No Tenant ID set — exports will use a placeholder and may not import correctly.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}