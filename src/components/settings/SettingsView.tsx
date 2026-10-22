import React, { useEffect, useState } from 'react';
import type { FinancialSettingsInput } from '../../utils/financialSettings';
import {
  Machine,
  Material,
  FixedCost,
  TaxConfig,
  CompanyProfile,
  UF
} from '../../types';
import {
  calcMachineCostRates,
  calcMaterialM2Cost,
  calcFixedCostMarkupPercentage,
  TARIFA_ENERGIA_POR_UF,
  TARIFA_MEDIA_NACIONAL_KWH,
  convertToMonthlyCost
} from '../../utils/calculations';
import {
  Settings,
  Cpu,
  Layers,
  DollarSign,
  Building2,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Clock,
  ShieldCheck
} from 'lucide-react';

interface SettingsViewProps {
  machines: Machine[];
  materials: Material[];
  fixedCosts: FixedCost[];
  monthlyRevenueTarget: number;
  taxes: TaxConfig[];
  company: CompanyProfile;
  onSaveCompany: (comp: CompanyProfile) => Promise<void>;
  onSaveMachine: (machine: Machine) => Promise<void>;
  onSaveMaterial: (material: Material) => Promise<void>;
  onSaveFinancial: (settings: FinancialSettingsInput) => Promise<void>;
  onRemoveMaterial: (id: string) => Promise<void>;
  onRemoveMachine: (id: string) => Promise<void>;
  onCreateMachine: (machine: Machine) => Promise<void>;
  onCreateMaterial: (material: Material) => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  machines,
  materials,
  fixedCosts: savedFixedCosts,
  monthlyRevenueTarget: savedMonthlyRevenueTarget,
  taxes: savedTaxes,
  company: savedCompany,
  onSaveCompany,
  onSaveMachine,
  onSaveMaterial,
  onSaveFinancial,
  onRemoveMaterial,
  onRemoveMachine,
  onCreateMachine,
  onCreateMaterial
}) => {
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [machineDraft, setMachineDraft] = useState({ name: '', type: 'CO2' as Machine['type'], width: '', height: '', purchasePrice: '' });
  const [materialDraft, setMaterialDraft] = useState({ name: '', category: 'MDF' as Material['category'], thickness: '', width: '', length: '', unitCost: '' });
  const [creationMode, setCreationMode] = useState<'machine' | 'material' | null>(null);
  const [machineEdits, setMachineEdits] = useState<Record<string, Machine>>({});
  const [materialEdits, setMaterialEdits] = useState<Record<string, Material>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fixedCostDraft, setFixedCostDraft] = useState({ name: '', amount: '', periodicity: 'Mensal' as FixedCost['periodicity'] });
  const [taxDraft, setTaxDraft] = useState({ name: '', percentage: '', regime: 'Simples Nacional' as TaxConfig['regime'] });
  const [showFixedCostForm, setShowFixedCostForm] = useState(false);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [financialDraft, setFinancialDraft] = useState<FinancialSettingsInput>({ fixedCosts: savedFixedCosts, monthlyRevenueTarget: savedMonthlyRevenueTarget, taxes: savedTaxes });
  const [financialDirty, setFinancialDirty] = useState(false);
  const [savingFinancial, setSavingFinancial] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyProfile>(savedCompany);
  const [companyDirty, setCompanyDirty] = useState(false);
  const [savingCompany, setSavingCompany] = useState(false);
  const [companyError, setCompanyError] = useState<string | null>(null);
  const company = companyDraft;
  const onUpdateCompany = (value: CompanyProfile) => { setCompanyDraft(value); setCompanyDirty(true); setCompanyError(null); };
  useEffect(() => { if (!companyDirty) setCompanyDraft(savedCompany); }, [savedCompany]);
  const saveCompany = async () => {
    if (savingCompany) return;
    if (!companyDraft.tradeName.trim()) { setCompanyError('Informe o nome fantasia da oficina.'); return; }
    setSavingCompany(true); setCompanyError(null);
    try { await onSaveCompany(companyDraft); setCompanyDirty(false); }
    catch (error) { setCompanyError(error instanceof Error ? error.message : 'Não foi possível salvar o perfil da oficina.'); }
    finally { setSavingCompany(false); }
  };
  const { fixedCosts, monthlyRevenueTarget, taxes } = financialDraft;
  const onUpdateFixedCosts = (value: FixedCost[]) => { setFinancialDraft(previous => ({ ...previous, fixedCosts: value })); setFinancialDirty(true); setFinancialError(null); };
  const onUpdateMonthlyRevenueTarget = (value: number) => { setFinancialDraft(previous => ({ ...previous, monthlyRevenueTarget: value })); setFinancialDirty(true); setFinancialError(null); };
  const onUpdateTaxes = (value: TaxConfig[]) => { setFinancialDraft(previous => ({ ...previous, taxes: value })); setFinancialDirty(true); setFinancialError(null); };
  useEffect(() => {
    if (!financialDirty) setFinancialDraft({ fixedCosts: savedFixedCosts, monthlyRevenueTarget: savedMonthlyRevenueTarget, taxes: savedTaxes });
  }, [savedFixedCosts, savedMonthlyRevenueTarget, savedTaxes]);
  const saveFinancial = async () => {
    if (savingFinancial) return;
    setSavingFinancial(true); setFinancialError(null);
    try { await onSaveFinancial(financialDraft); setFinancialDirty(false); }
    catch (error) { setFinancialError(error instanceof Error ? error.message : 'Não foi possível salvar os parâmetros financeiros.'); }
    finally { setSavingFinancial(false); }
  };
  const editingMachines = machines.map(machine => machineEdits[machine.id] || machine);
  const editingMaterials = materials.map(material => materialEdits[material.id] || material);

  useEffect(() => {
    setMachineEdits(previous => Object.fromEntries(Object.entries(previous).filter(([id, draft]) => {
      const remote = machines.find(machine => machine.id === id);
      return remote && JSON.stringify(remote) !== JSON.stringify(draft);
    })));
  }, [machines]);
  useEffect(() => {
    setMaterialEdits(previous => Object.fromEntries(Object.entries(previous).filter(([id, draft]) => {
      const remote = materials.find(material => material.id === id);
      return remote && JSON.stringify(remote) !== JSON.stringify(draft);
    })));
  }, [materials]);

  const saveMachine = async (machine: Machine) => {
    if (savingId) return;
    if (!machine.name.trim() || ![machine.workAreaX_mm, machine.workAreaY_mm].every(value => Number.isFinite(value) && value > 0) || ![machine.laserPowerW, machine.purchasePrice, machine.monthlyWorkHours, machine.energyConsumptionKwh, machine.tubeSpareCost].every(value => Number.isFinite(value) && value >= 0)) {
      setSaveError('Revise nome, área útil e valores da máquina.'); return;
    }
    setSaveError(null); setSavingId(machine.id);
    try { await onSaveMachine(machine); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar a máquina.'); }
    finally { setSavingId(null); }
  };
  const saveMaterial = async (material: Material) => {
    if (savingId) return;
    if (!material.name.trim() || ![material.thickness_mm, material.sheetWidth_mm, material.sheetLength_mm].every(value => Number.isFinite(value) && value > 0) || ![material.unitCost, material.shippingCost, material.lossPercentage].every(value => Number.isFinite(value) && value >= 0)) {
      setSaveError('Revise nome, espessura, dimensões e custos do material.'); return;
    }
    setSaveError(null); setSavingId(material.id);
    try { await onSaveMaterial(material); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Não foi possível salvar o material.'); }
    finally { setSavingId(null); }
  };
  const [activeTab, setActiveTab] = useState<
    'machines' | 'materials' | 'fixed-costs' | 'taxes' | 'company'
  >('machines');

  const currentTariff = TARIFA_ENERGIA_POR_UF[company.uf] || TARIFA_MEDIA_NACIONAL_KWH;

  // Add Machine Handler
  const handleAddMachine = async () => {
    const width = Number(machineDraft.width), height = Number(machineDraft.height), purchasePrice = Number(machineDraft.purchasePrice);
    if (!machineDraft.name.trim() || !machineDraft.width || !machineDraft.height || !machineDraft.purchasePrice || ![width, height, purchasePrice].every(Number.isFinite) || width <= 0 || height <= 0 || purchasePrice < 0) {
      setCreationError('Informe nome, área útil e preço de compra válidos.'); return;
    }
    const newMach: Machine = {
      id: 'mach-' + crypto.randomUUID(),
      name: machineDraft.name.trim(), model: '', type: machineDraft.type,
      laserPowerW: 0, workAreaX_mm: width, workAreaY_mm: height,
      purchasePrice, depreciationYears: 0, monthlyWorkHours: 0,
      energyConsumptionKwh: 0, monthlyMaintenanceCosts: 0, tubeSpareCost: 0
    };
    setCreationError(null); setCreating(true);
    try { await onCreateMachine(newMach); setCreationMode(null); setMachineDraft({ name: '', type: 'CO2', width: '', height: '', purchasePrice: '' }); }
    catch (error) { setCreationError(error instanceof Error ? error.message : 'Não foi possível cadastrar a máquina.'); }
    finally { setCreating(false); }
  };

  // Remove Machine
  const handleRemoveMachine = async (id: string) => {
    if (removingId) return;
    setRemovalError(null);
    setRemovingId(id);
    try { await onRemoveMachine(id); }
    catch (error) { setRemovalError(error instanceof Error ? error.message : 'Não foi possível excluir a máquina.'); }
    finally { setRemovingId(null); }
  };

  // Remove Material Handler
  const handleRemoveMaterial = async (id: string) => {
    if (removingId) return;
    setRemovalError(null);
    setRemovingId(id);
    try { await onRemoveMaterial(id); }
    catch (error) { setRemovalError(error instanceof Error ? error.message : 'Não foi possível excluir o material.'); }
    finally { setRemovingId(null); }
  };

  // Add Material Handler
  const handleAddMaterial = async () => {
    const thickness = Number(materialDraft.thickness), width = Number(materialDraft.width), length = Number(materialDraft.length), unitCost = Number(materialDraft.unitCost);
    if (!materialDraft.name.trim() || !materialDraft.thickness || !materialDraft.width || !materialDraft.length || !materialDraft.unitCost || ![thickness, width, length, unitCost].every(Number.isFinite) || thickness <= 0 || width <= 0 || length <= 0 || unitCost < 0) {
      setCreationError('Informe nome, espessura, medidas da chapa e custo válidos.'); return;
    }
    const newMat: Material = {
      id: 'mat-' + crypto.randomUUID(),
      name: materialDraft.name.trim(), category: materialDraft.category,
      thickness_mm: thickness, sheetWidth_mm: width, sheetLength_mm: length,
      unitCost, shippingCost: 0, lossPercentage: 0, density_kg_m3: 0,
      speedsByMachine: []
    };
    setCreationError(null); setCreating(true);
    try { await onCreateMaterial(newMat); setCreationMode(null); setMaterialDraft({ name: '', category: 'MDF', thickness: '', width: '', length: '', unitCost: '' }); }
    catch (error) { setCreationError(error instanceof Error ? error.message : 'Não foi possível cadastrar o material.'); }
    finally { setCreating(false); }
  };

  // Add Fixed Cost
  const handleAddFixedCost = () => {
    const amount = Number(fixedCostDraft.amount);
    if (!fixedCostDraft.name.trim() || !fixedCostDraft.amount || !Number.isFinite(amount) || amount < 0) { setCreationError('Informe descrição e valor válidos da despesa.'); return; }
    const newFc: FixedCost = {
      id: 'fc-' + crypto.randomUUID(),
      name: fixedCostDraft.name.trim(),
      amount,
      category: 'Outros',
      periodicity: fixedCostDraft.periodicity
    };
    onUpdateFixedCosts([...fixedCosts, newFc]);
    setFixedCostDraft({ name: '', amount: '', periodicity: 'Mensal' }); setShowFixedCostForm(false); setCreationError(null);
  };

  const fixedCostAnalysis = calcFixedCostMarkupPercentage(fixedCosts, monthlyRevenueTarget);

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Cadastros Técnicos & Engenharia de Custos</h1>
            <p className="text-xs text-slate-500">
              Parametrização exata de máquinas, materiais, tarifas estaduais, custos fixos e mark-up
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 overflow-x-auto max-w-full">
          <button
            onClick={() => setActiveTab('machines')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'machines' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Máquinas Laser & CNC
          </button>
          <button
            onClick={() => setActiveTab('materials')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'materials' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Materiais & Chapas
          </button>
          <button
            onClick={() => setActiveTab('fixed-costs')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'fixed-costs' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Custos Fixos & Meta
          </button>
          <button
            onClick={() => setActiveTab('taxes')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'taxes' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Impostos
          </button>
          <button
            onClick={() => setActiveTab('company')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'company' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Perfil da Empresa
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {removalError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{removalError}</p>}
        {saveError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{saveError}</p>}
        {financialError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{financialError}</p>}
        {companyError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{companyError}</p>}
        {activeTab === 'company' && companyDirty && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="mr-auto font-semibold">Perfil da oficina com alterações não salvas</span>
          <button type="button" disabled={savingCompany} onClick={() => { setCompanyDraft(savedCompany); setCompanyDirty(false); setCompanyError(null); }} className="rounded-lg border border-amber-300 px-3 py-1.5 disabled:opacity-50">Cancelar alterações</button>
          <button type="button" disabled={savingCompany} onClick={() => { void saveCompany(); }} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-white disabled:opacity-50">{savingCompany ? 'Salvando...' : 'Salvar perfil'}</button>
        </div>}
        {(activeTab === 'fixed-costs' || activeTab === 'taxes') && financialDirty && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <span className="mr-auto font-semibold">Parâmetros financeiros com alterações não salvas</span>
          <button type="button" disabled={savingFinancial} onClick={() => { setFinancialDraft({ fixedCosts: savedFixedCosts, monthlyRevenueTarget: savedMonthlyRevenueTarget, taxes: savedTaxes }); setFinancialDirty(false); setFinancialError(null); }} className="rounded-lg border border-amber-300 px-3 py-1.5 disabled:opacity-50">Cancelar alterações</button>
          <button type="button" disabled={savingFinancial} onClick={() => { void saveFinancial(); }} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-white disabled:opacity-50">{savingFinancial ? 'Salvando...' : 'Salvar parâmetros financeiros'}</button>
        </div>}
        {/* TAB 1: MÁQUINAS LASER */}
        {activeTab === 'machines' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-amber-600" />
                  Parque de Máquinas CNC / Laser & Custo por Hora
                </h3>
                <p className="text-xs text-slate-500">
                  Depreciação + Energia Elétrica ({company.uf}: R$ {currentTariff.toFixed(2)}/kWh) + Manutenção e Reserva de Tubo
                </p>
              </div>

              <button
                onClick={() => { setCreationError(null); setCreationMode('machine'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova Máquina
              </button>
            </div>

            {creationMode === 'machine' && <form onSubmit={event => { event.preventDefault(); void handleAddMachine(); }} className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900">Cadastrar máquina</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                <input aria-label="Nome da máquina" placeholder="Nome da máquina" value={machineDraft.name} onChange={e => setMachineDraft({ ...machineDraft, name: e.target.value })} className="rounded-lg border p-2" required />
                <select aria-label="Tipo da máquina" value={machineDraft.type} onChange={e => setMachineDraft({ ...machineDraft, type: e.target.value as Machine['type'] })} className="rounded-lg border p-2">{(['CO2', 'Diodo', 'Fibra', 'Router', 'Plasma'] as const).map(type => <option key={type}>{type}</option>)}</select>
                <input aria-label="Mesa X em milímetros" type="number" min="0.01" step="any" placeholder="Mesa X (mm)" value={machineDraft.width} onChange={e => setMachineDraft({ ...machineDraft, width: e.target.value })} className="rounded-lg border p-2" required />
                <input aria-label="Mesa Y em milímetros" type="number" min="0.01" step="any" placeholder="Mesa Y (mm)" value={machineDraft.height} onChange={e => setMachineDraft({ ...machineDraft, height: e.target.value })} className="rounded-lg border p-2" required />
                <input aria-label="Preço de compra" type="number" min="0" step="any" placeholder="Preço de compra (R$)" value={machineDraft.purchasePrice} onChange={e => setMachineDraft({ ...machineDraft, purchasePrice: e.target.value })} className="rounded-lg border p-2" required />
              </div>
              <p className="text-slate-600">Potência, consumo, horas e manutenção começam sem valores informados. Complete esses parâmetros antes de usar custos de máquina.</p>
              {creationError && <p role="alert" className="text-rose-700">{creationError}</p>}
              <div className="flex gap-2"><button type="submit" disabled={creating} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white disabled:opacity-50">{creating ? 'Salvando...' : 'Salvar máquina'}</button><button type="button" disabled={creating} onClick={() => setCreationMode(null)} className="rounded-lg border px-3 py-2">Cancelar</button></div>
            </form>}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {editingMachines.map((mach, index) => {
                const rates = calcMachineCostRates(mach, company.uf);
                return (
                  <div
                    key={mach.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={mach.name}
                        onChange={e => {
                          const next = editingMachines.map(machine => ({ ...machine }));
                          next[index].name = e.target.value;
                          setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                        }}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-bold text-slate-900 w-2/3 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => { void handleRemoveMachine(mach.id); }}
                        disabled={!!removingId}
                        className="text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Remover máquina"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Potência (W)</label>
                        <input
                          type="number"
                          value={mach.laserPowerW}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].laserPowerW = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Mesa X (mm)</label>
                        <input
                          type="number"
                          value={mach.workAreaX_mm}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].workAreaX_mm = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Mesa Y (mm)</label>
                        <input
                          type="number"
                          value={mach.workAreaY_mm}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].workAreaY_mm = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Depreciação (anos)</label>
                        <input type="number" min="0" step="any" value={mach.depreciationYears} onChange={e => setMachineEdits(previous => ({ ...previous, [mach.id]: { ...mach, depreciationYears: Number(e.target.value) } }))} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Manutenção mensal (R$)</label>
                        <input type="number" min="0" step="any" value={mach.monthlyMaintenanceCosts} onChange={e => setMachineEdits(previous => ({ ...previous, [mach.id]: { ...mach, monthlyMaintenanceCosts: Number(e.target.value) } }))} className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono" />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Preço Compra (R$)</label>
                        <input
                          type="number"
                          value={mach.purchasePrice}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].purchasePrice = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Horas/Mês</label>
                        <input
                          type="number"
                          value={mach.monthlyWorkHours}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].monthlyWorkHours = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Consumo (kWh)</label>
                        <input
                          type="number"
                          step="0.1"
                          value={mach.energyConsumptionKwh}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].energyConsumptionKwh = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Reserva Tubo (R$)</label>
                        <input
                          type="number"
                          value={mach.tubeSpareCost}
                          onChange={e => {
                            const next = editingMachines.map(machine => ({ ...machine }));
                            next[index].tubeSpareCost = Number(e.target.value);
                            setMachineEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Calculated Hourly and Per-Second Cost Badge */}
                    {mach.depreciationYears > 0 && mach.monthlyWorkHours > 0 ? <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Custo por Segundo:</span>
                        <span className="font-mono text-xs text-indigo-700 font-bold">
                          R$ {rates.perSecond.toFixed(4)} / seg
                        </span>
                      </div>

                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Custo Total por Hora:</span>
                        <span className="font-mono text-base font-extrabold text-amber-700">
                          R$ {rates.hourly.toFixed(2)} / hora
                        </span>
                      </div>
                    </div> : <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800">Custo por hora indisponível. Informe depreciação e horas mensais; revise também o consumo elétrico.</p>}
                    {machineEdits[mach.id] && <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                      <span className="mr-auto text-amber-700">Alterações não salvas</span>
                      <button type="button" disabled={!!savingId} onClick={() => setMachineEdits(previous => { const next = { ...previous }; delete next[mach.id]; return next; })} className="rounded-lg border px-3 py-1.5 disabled:opacity-50">Cancelar</button>
                      <button type="button" disabled={!!savingId} onClick={() => { void saveMachine(mach); }} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-white disabled:opacity-50">{savingId === mach.id ? 'Salvando...' : 'Salvar máquina'}</button>
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: MATERIAIS & CHAPAS */}
        {activeTab === 'materials' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-600" />
                  Cadastro de Materiais, Chapas e Velocidades
                </h3>
                <p className="text-xs text-slate-500">
                  Custo por m², frete e velocidades específicas de corte/gravação para cada máquina
                </p>
              </div>

              <button
                onClick={() => { setCreationError(null); setCreationMode('material'); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Material
              </button>
            </div>

            {creationMode === 'material' && <form onSubmit={event => { event.preventDefault(); void handleAddMaterial(); }} className="rounded-2xl border border-amber-200 bg-white p-4 space-y-3 text-xs">
              <h4 className="font-bold text-slate-900">Cadastrar material</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                <input aria-label="Nome do material" placeholder="Nome do material" value={materialDraft.name} onChange={e => setMaterialDraft({ ...materialDraft, name: e.target.value })} className="rounded-lg border p-2" required />
                <select aria-label="Categoria do material" value={materialDraft.category} onChange={e => setMaterialDraft({ ...materialDraft, category: e.target.value as Material['category'] })} className="rounded-lg border p-2">{(['MDF', 'Acrílico', 'Compensado', 'Madeira Maciça', 'EVA', 'Papelão', 'Couro'] as const).map(category => <option key={category}>{category}</option>)}</select>
                <input aria-label="Espessura em milímetros" type="number" min="0.01" step="any" placeholder="Espessura (mm)" value={materialDraft.thickness} onChange={e => setMaterialDraft({ ...materialDraft, thickness: e.target.value })} className="rounded-lg border p-2" required />
                <input aria-label="Largura da chapa em milímetros" type="number" min="0.01" step="any" placeholder="Largura da chapa (mm)" value={materialDraft.width} onChange={e => setMaterialDraft({ ...materialDraft, width: e.target.value })} className="rounded-lg border p-2" required />
                <input aria-label="Comprimento da chapa em milímetros" type="number" min="0.01" step="any" placeholder="Comprimento da chapa (mm)" value={materialDraft.length} onChange={e => setMaterialDraft({ ...materialDraft, length: e.target.value })} className="rounded-lg border p-2" required />
                <input aria-label="Custo da chapa" type="number" min="0" step="any" placeholder="Custo da chapa (R$)" value={materialDraft.unitCost} onChange={e => setMaterialDraft({ ...materialDraft, unitCost: e.target.value })} className="rounded-lg border p-2" required />
              </div>
              <p className="text-slate-600">Velocidades de corte e gravação não são presumidas. Cadastre os parâmetros da combinação material e máquina antes de produzir.</p>
              {creationError && <p role="alert" className="text-rose-700">{creationError}</p>}
              <div className="flex gap-2"><button type="submit" disabled={creating} className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white disabled:opacity-50">{creating ? 'Salvando...' : 'Salvar material'}</button><button type="button" disabled={creating} onClick={() => setCreationMode(null)} className="rounded-lg border px-3 py-2">Cancelar</button></div>
            </form>}

            <div className="grid grid-cols-1 gap-4">
              {editingMaterials.map((mat, index) => {
                const { areaM2, costPerM2 } = calcMaterialM2Cost(mat);
                return (
                  <div
                    key={mat.id}
                    className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={mat.name}
                          onChange={e => {
                            const next = editingMaterials.map(material => ({ ...material }));
                            next[index].name = e.target.value;
                            setMaterialEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-bold text-slate-900 w-72 focus:outline-none focus:border-amber-500"
                        />
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold font-mono">
                          {mat.thickness_mm} mm
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-slate-500">
                          Área Chapa: <strong className="text-slate-900 font-mono">{areaM2.toFixed(3)} m²</strong>
                        </span>
                        <span className="text-amber-700 font-bold">
                          Custo Real:{' '}
                          <strong className="text-emerald-700 font-mono text-sm">
                            R$ {costPerM2.toFixed(2)} / m²
                          </strong>
                        </span>
                        <button
                          onClick={() => { void handleRemoveMaterial(mat.id); }}
                          disabled={!!removingId}
                          className="text-slate-400 hover:text-rose-600 transition cursor-pointer p-1 rounded hover:bg-slate-100"
                          title="Remover material"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Largura Chapa (mm)</label>
                        <input
                          type="number"
                          value={mat.sheetWidth_mm}
                          onChange={e => {
                            const next = editingMaterials.map(material => ({ ...material }));
                            next[index].sheetWidth_mm = Number(e.target.value);
                            setMaterialEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Comprimento (mm)</label>
                        <input
                          type="number"
                          value={mat.sheetLength_mm}
                          onChange={e => {
                            const next = editingMaterials.map(material => ({ ...material }));
                            next[index].sheetLength_mm = Number(e.target.value);
                            setMaterialEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Preço Unitário (R$)</label>
                        <input
                          type="number"
                          value={mat.unitCost}
                          onChange={e => {
                            const next = editingMaterials.map(material => ({ ...material }));
                            next[index].unitCost = Number(e.target.value);
                            setMaterialEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Frete Unit. (R$)</label>
                        <input
                          type="number"
                          value={mat.shippingCost}
                          onChange={e => {
                            const next = editingMaterials.map(material => ({ ...material }));
                            next[index].shippingCost = Number(e.target.value);
                            setMaterialEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">% Perda Prevista</label>
                        <input
                          type="number"
                          value={mat.lossPercentage}
                          onChange={e => {
                            const next = editingMaterials.map(material => ({ ...material }));
                            next[index].lossPercentage = Number(e.target.value);
                            setMaterialEdits(previous => ({ ...previous, [next[index].id]: next[index] }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                    </div>
                    {materialEdits[mat.id] && <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                      <span className="mr-auto text-amber-700">Alterações não salvas</span>
                      <button type="button" disabled={!!savingId} onClick={() => setMaterialEdits(previous => { const next = { ...previous }; delete next[mat.id]; return next; })} className="rounded-lg border px-3 py-1.5 disabled:opacity-50">Cancelar</button>
                      <button type="button" disabled={!!savingId} onClick={() => { void saveMaterial(mat); }} className="rounded-lg bg-amber-500 px-3 py-1.5 font-bold text-white disabled:opacity-50">{savingId === mat.id ? 'Salvando...' : 'Salvar material'}</button>
                    </div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: CUSTOS FIXOS & META */}
        {activeTab === 'fixed-costs' && (
          <div className="space-y-5">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-600" />
                    Meta de Faturamento Mensal & Diluição de Custos Fixos
                  </h3>
                  <p className="text-xs text-slate-500">
                    O índice %CF é a base do mark-up divisor: <code>%CF = (Custos_Fixos ÷ Meta) × 100</code>
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <label className="text-xs text-slate-700 font-semibold">Meta Mensal (R$):</label>
                  <input
                    type="number"
                    value={monthlyRevenueTarget}
                    onChange={e => onUpdateMonthlyRevenueTarget(Math.max(1000, Number(e.target.value)))}
                    className="bg-slate-50 border border-amber-400 rounded-xl px-3 py-1.5 text-sm font-mono font-bold text-amber-700 focus:outline-none"
                  />
                </div>
              </div>

              {/* Status Alert */}
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                  fixedCostAnalysis.isDeficitAlert
                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                }`}
              >
                <span>
                  Total de Despesas Fixas Mensalizadas:{' '}
                  <strong className="font-mono text-slate-900">
                    R$ {fixedCostAnalysis.totalMonthlyCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </strong>
                </span>

                <span className="font-bold font-mono">
                  Índice %CF para o Preço:{' '}
                  <strong className="text-amber-700 text-sm">
                    {fixedCostAnalysis.fixedCostPct.toFixed(2)}%
                  </strong>
                </span>
              </div>
            </div>

            {/* List of Fixed Costs */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Despesas Fixas Cadastradas
                </span>
                <button
                  onClick={() => { setCreationError(null); setShowFixedCostForm(true); }}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-600" /> Adicionar Despesa
                </button>
              </div>

              {showFixedCostForm && <form onSubmit={event => { event.preventDefault(); handleAddFixedCost(); }} className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-xl border border-amber-200 p-3 text-xs">
                <input aria-label="Descrição da despesa" placeholder="Descrição da despesa" value={fixedCostDraft.name} onChange={event => setFixedCostDraft({ ...fixedCostDraft, name: event.target.value })} className="rounded-lg border p-2" required />
                <input aria-label="Valor da despesa" type="number" min="0" step="any" placeholder="Valor (R$)" value={fixedCostDraft.amount} onChange={event => setFixedCostDraft({ ...fixedCostDraft, amount: event.target.value })} className="rounded-lg border p-2" required />
                <select aria-label="Periodicidade da despesa" value={fixedCostDraft.periodicity} onChange={event => setFixedCostDraft({ ...fixedCostDraft, periodicity: event.target.value as FixedCost['periodicity'] })} className="rounded-lg border p-2">{(['Mensal', 'Diário', 'Semanal', 'Trimestral', 'Semestral', 'Anual'] as const).map(periodicity => <option key={periodicity}>{periodicity}</option>)}</select>
                <div className="flex gap-2"><button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white">Adicionar</button><button type="button" onClick={() => setShowFixedCostForm(false)} className="rounded-lg border px-3 py-2">Cancelar</button></div>
                {creationError && <p role="alert" className="text-rose-700 sm:col-span-4">{creationError}</p>}
              </form>}

              <div className="space-y-2">
                {fixedCosts.map((fc, idx) => (
                  <div
                    key={fc.id}
                    className="flex flex-wrap items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs gap-3"
                  >
                    <input
                      type="text"
                      value={fc.name}
                      onChange={e => {
                        const next = [...fixedCosts];
                        next[idx].name = e.target.value;
                        onUpdateFixedCosts(next);
                      }}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-medium flex-1 min-w-[200px] focus:outline-none focus:border-amber-500"
                    />

                    <div className="flex items-center gap-3">
                      <select
                        value={fc.periodicity}
                        onChange={e => {
                          const next = [...fixedCosts];
                          next[idx].periodicity = e.target.value as any;
                          onUpdateFixedCosts(next);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 focus:outline-none"
                      >
                        <option value="Mensal">Mensal</option>
                        <option value="Diário">Diário (x30)</option>
                        <option value="Semanal">Semanal (x4,33)</option>
                        <option value="Trimestral">Trimestral (/3)</option>
                        <option value="Semestral">Semestral (/6)</option>
                        <option value="Anual">Anual (/12)</option>
                      </select>

                      <input
                        type="number"
                        value={fc.amount}
                        onChange={e => {
                          const next = [...fixedCosts];
                          next[idx].amount = Number(e.target.value);
                          onUpdateFixedCosts(next);
                        }}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono font-bold w-28 focus:outline-none"
                      />

                      <button
                        onClick={() => onUpdateFixedCosts(fixedCosts.filter(f => f.id !== fc.id))}
                        className="text-slate-400 hover:text-rose-600 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: IMPOSTOS */}
        {activeTab === 'taxes' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-xs">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              Configuração Tributária & Alíquotas Fiscais
            </h3>
            <p className="text-xs text-slate-500">
              Alíquotas incidentes sobre o faturamento que entram na equação do Mark-up Divisor
            </p>

            <button type="button" onClick={() => { setCreationError(null); setShowTaxForm(true); }} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 font-semibold"><Plus className="h-3.5 w-3.5" />Adicionar alíquota</button>
            {showTaxForm && <form onSubmit={event => { event.preventDefault(); const percentage = Number(taxDraft.percentage); if (!taxDraft.name.trim() || !taxDraft.percentage || !Number.isFinite(percentage) || percentage < 0 || percentage >= 100) { setCreationError('Informe nome e alíquota válida entre 0% e 100%.'); return; } onUpdateTaxes([...taxes, { id: `tax-${crypto.randomUUID()}`, name: taxDraft.name.trim(), percentage, regime: taxDraft.regime, active: true }]); setTaxDraft({ name: '', percentage: '', regime: 'Simples Nacional' }); setShowTaxForm(false); setCreationError(null); }} className="grid grid-cols-1 sm:grid-cols-4 gap-2 rounded-xl border border-amber-200 p-3">
              <input aria-label="Nome da alíquota" placeholder="Nome da alíquota" value={taxDraft.name} onChange={event => setTaxDraft({ ...taxDraft, name: event.target.value })} className="rounded-lg border p-2" required />
              <input aria-label="Percentual da alíquota" type="number" min="0" max="99.99" step="any" placeholder="Alíquota (%)" value={taxDraft.percentage} onChange={event => setTaxDraft({ ...taxDraft, percentage: event.target.value })} className="rounded-lg border p-2" required />
              <select aria-label="Regime tributário" value={taxDraft.regime} onChange={event => setTaxDraft({ ...taxDraft, regime: event.target.value as TaxConfig['regime'] })} className="rounded-lg border p-2">{(['Simples Nacional', 'MEI', 'Lucro Presumido', 'Lucro Real'] as const).map(regime => <option key={regime}>{regime}</option>)}</select>
              <div className="flex gap-2"><button type="submit" className="rounded-lg bg-amber-500 px-3 py-2 font-bold text-white">Adicionar</button><button type="button" onClick={() => setShowTaxForm(false)} className="rounded-lg border px-3 py-2">Cancelar</button></div>
              {creationError && <p role="alert" className="text-rose-700 sm:col-span-4">{creationError}</p>}
            </form>}

            <div className="space-y-2">
              {taxes.map((t, idx) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={t.active}
                      onChange={e => {
                        const next = taxes.map(tax => ({ ...tax }));
                        next[idx].active = e.target.checked;
                        onUpdateTaxes(next);
                      }}
                      className="rounded border-slate-300 text-amber-500 focus:ring-0"
                    />
                    <div className="flex flex-col gap-1">
                      <input aria-label="Nome da alíquota" value={t.name} onChange={e => onUpdateTaxes(taxes.map((tax, index) => index === idx ? { ...tax, name: e.target.value } : tax))} className="rounded border bg-white px-2 py-1 font-semibold text-slate-900" />
                      <select aria-label="Regime tributário" value={t.regime} onChange={e => onUpdateTaxes(taxes.map((tax, index) => index === idx ? { ...tax, regime: e.target.value as TaxConfig['regime'] } : tax))} className="rounded border bg-white px-2 py-1 text-[10px] text-slate-600">{(['Simples Nacional', 'MEI', 'Lucro Presumido', 'Lucro Real'] as const).map(regime => <option key={regime}>{regime}</option>)}</select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={t.percentage}
                      onChange={e => {
                        const next = taxes.map(tax => ({ ...tax }));
                        next[idx].percentage = Number(e.target.value);
                        onUpdateTaxes(next);
                      }}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono font-bold w-20 focus:outline-none"
                    />
                    <span className="font-mono text-slate-500">%</span>
                    <button type="button" aria-label={`Excluir alíquota ${t.name}`} onClick={() => onUpdateTaxes(taxes.filter(tax => tax.id !== t.id))} className="rounded p-1 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: PERFIL DA EMPRESA */}
        {activeTab === 'company' && (
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4 text-xs max-w-3xl">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-600" />
              Dados Cadastrais da Empresa & Alíquota Estadual CEMIG (MG)
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Razão Social</label>
                <input
                  type="text"
                  value={company.name}
                  onChange={e => onUpdateCompany({ ...company, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={company.tradeName}
                  onChange={e => onUpdateCompany({ ...company, tradeName: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">CNPJ</label>
                <input
                  type="text"
                  value={company.cnpj}
                  onChange={e => onUpdateCompany({ ...company, cnpj: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Inscrição Estadual (IE)</label>
                <input
                  type="text"
                  value={company.ie}
                  onChange={e => onUpdateCompany({ ...company, ie: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Estado (UF) - Tarifa de Energia
                </label>
                <select
                  value={company.uf}
                  onChange={e => onUpdateCompany({ ...company, uf: e.target.value as UF })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-amber-700 font-bold focus:outline-none"
                >
                  {(Object.keys(TARIFA_ENERGIA_POR_UF) as UF[]).map(uf => (
                    <option key={uf} value={uf}>
                      {uf} (R$ {TARIFA_ENERGIA_POR_UF[uf].toFixed(2)}/kWh)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Cidade / Município</label>
                <input
                  type="text"
                  value={company.city}
                  onChange={e => onUpdateCompany({ ...company, city: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  value={company.phone}
                  onChange={e => onUpdateCompany({ ...company, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-600 block mb-1">Endereço Completo da Oficina</label>
              <input
                type="text"
                value={company.address}
                onChange={e => onUpdateCompany({ ...company, address: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none"
              />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
