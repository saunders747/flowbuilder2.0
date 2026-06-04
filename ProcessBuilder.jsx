import React, { useState, useRef } from 'react';
import { appClient } from '@/api/standaloneClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Save, Trash2, Copy, Edit, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProcess } from '@/lib/processContext';
import { toast } from 'sonner';
import ProcessList from '@/components/process/ProcessList';
import ProcessForm from '@/components/process/ProcessForm';

export default function ProcessBuilder() {
  const [tab, setTab] = useState('list');
  const [editingProcess, setEditingProcess] = useState(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { loadProcess, addStep, reorderSteps } = useProcess();
  const explicitSaveRef = React.useRef(false);
  const pendingImportSteps = React.useRef(null);

  const { data: processes = [], isLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: () => appClient.entities.Process.list('-updated_date', 200),
  });

  const createMutation = useMutation({
    mutationFn: (data) => appClient.entities.Process.create(data),
    onSuccess: async (createdProcess) => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      const stepsToImport = pendingImportSteps.current;
      pendingImportSteps.current = null; // clear immediately — prevents double-fire
      setTab('list');
      setEditingProcess(null);
      if (stepsToImport?.length > 0) {
        await loadProcess(createdProcess);
        // Build all steps at once and call reorderSteps — single state update,
        // no per-step timing race, no duplicates
        const newSteps = stepsToImport.map((s, i) => ({
          id: `step_${Date.now()}_${Math.random().toString(36).substr(2,9)}_${i}`,
          step_number: i + 1,
          task_description: s.task_description || '',
          role: s.role || '',
          section: s.section || '',
          manual_time: s.manual_time || 0,
          walking_time: s.walking_time || 0,
          waiting_time: s.waiting_time || 0,
          machine_time: s.machine_time || 0,
          inspection_time: s.inspection_time || 0,
          tool_time_category: s.tool_time_category || '',
          dependencies: [],
          start_time: 0,
          start_time_override: false,
          start_offset: 0,
        }));
        reorderSteps(newSteps);
        toast.success(`Process created — ${newSteps.length} steps imported`);
        navigate('/combination-table');
      } else {
        toast.success('Process created');
      }
    },
    onError: (err) => {
      console.error('Create failed:', err);
      toast.error(err?.message || 'Failed to create process');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => appClient.entities.Process.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      if (explicitSaveRef.current) {
        toast.success('Process updated');
        setTab('list');
        setEditingProcess(null);
        explicitSaveRef.current = false;
      }
    },
    onError: (err) => {
      console.error('Update failed:', err);
      toast.error(err?.message || 'Failed to update process');
      explicitSaveRef.current = false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => appClient.entities.Process.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success('Process deleted');
    },
    onError: (err) => {
      console.error('Delete failed:', err);
      toast.error(err?.message || 'Failed to delete process');
    },
  });

  const handleSave = (formData, isExplicit = false, importPreview = null) => {
    if (editingProcess) {
      explicitSaveRef.current = isExplicit;
      updateMutation.mutate({ id: editingProcess.id, data: formData });
    } else {
      pendingImportSteps.current = importPreview;
      createMutation.mutate(formData);
    }
  };

  const handleOpen = async (process) => {
    await loadProcess(process);
    navigate('/combination-table');
  };

  const handleClone = async (process) => {
    const { id, created_date, updated_date, created_by, ...rest } = process;
    rest.name = `${rest.name} (Clone)`;
    rest.version = 1;
    rest.approval_status = 'Draft';
    rest.version_type = 'Draft';
    createMutation.mutate(rest);
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex items-center justify-between">
          <TabsList data-tour="process-tabs">
            <TabsTrigger value="list">All Processes</TabsTrigger>
            <TabsTrigger value="form">{editingProcess ? 'Edit Process' : 'New Process'}</TabsTrigger>
          </TabsList>
          <Button data-tour="new-process-btn" onClick={() => { setEditingProcess(null); setTab('form'); }} className="gap-2">
            <Plus className="w-4 h-4" /> New Process
          </Button>
        </div>

        <TabsContent value="list">
          <div data-tour="process-list">
          <ProcessList
            processes={processes}
            isLoading={isLoading}
            onEdit={(p) => { setEditingProcess(p); setTab('form'); }}
            onDelete={(id) => deleteMutation.mutate(id)}
            onOpen={handleOpen}
            onClone={handleClone}
          />
          </div>
        </TabsContent>

        <TabsContent value="form">
          <ProcessForm
            process={editingProcess}
            onSave={handleSave}
            isSaving={createMutation.isPending || updateMutation.isPending}
            onCancel={() => { setEditingProcess(null); setTab('list'); }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}