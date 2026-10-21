import React, { useState } from 'react';
import {
  Machine,
  Material,
  FixedCost,
  TaxConfig,
  CompanyProfile,
  PlanConfig,
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
import { PLANS } from '../../data/initialData';
import {
  Settings,
  Cpu,
  Layers,
  DollarSign,
  Building2,
  CreditCard,
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
  currentPlanId: string;
  onUpdateCompany: (comp: CompanyProfile) => void;
  onUpdateMachines: (machs: Machine[]) => void;
  onUpdateMaterials: (mats: Material[]) => void;
  onUpdateFixedCosts: (fcs: FixedCost[]) => void;
  onUpdateMonthlyRevenueTarget: (val: number) => void;
  onUpdateTaxes: (taxes: TaxConfig[]) => void;
  onSwitchPlan: (planId: any) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  machines,
  materials,
  fixedCosts,
  monthlyRevenueTarget,
  taxes,
  company,
  currentPlanId,
  onUpdateCompany,
  onUpdateMachines,
  onUpdateMaterials,
  onUpdateFixedCosts,
  onUpdateMonthlyRevenueTarget,
  onUpdateTaxes,
  onSwitchPlan
}) => {
  const [activeTab, setActiveTab] = useState<
    'machines' | 'materials' | 'fixed-costs' | 'taxes' | 'company' | 'plans'
  >('machines');

  const currentTariff = TARIFA_ENERGIA_POR_UF[company.uf] || TARIFA_MEDIA_NACIONAL_KWH;

  // Add Machine Handler
  const handleAddMachine = () => {
    const newMach: Machine = {
      id: 'mach-' + Date.now(),
      name: 'Nova CNC Laser CO2',
      model: 'Controladora Ruida / Tubo 80W',
      type: 'CO2',
      laserPowerW: 80,
      workAreaX_mm: 700,
      workAreaY_mm: 500,
      purchasePrice: 24000,
      depreciationYears: 5,
      monthlyWorkHours: 160,
      energyConsumptionKwh: 2.0,
      monthlyMaintenanceCosts: 200,
      tubeSpareCost: 3200
    };
    onUpdateMachines([...machines, newMach]);
  };

  // Remove Machine
  const handleRemoveMachine = (id: string) => {
    if (machines.length <= 1) return;
    onUpdateMachines(machines.filter(m => m.id !== id));
  };

  // Add Material Handler
  const handleAddMaterial = () => {
    const newMat: Material = {
      id: 'mat-' + Date.now(),
      name: 'Novo Material MDF / Acrílico',
      category: 'MDF',
      thickness_mm: 3.0,
      sheetWidth_mm: 1850,
      sheetLength_mm: 2750,
      unitCost: 90.0,
      shippingCost: 15.0,
      lossPercentage: 8.0,
      density_kg_m3: 750,
      speedsByMachine: machines.map(m => ({
        machineId: m.id,
        cutSpeed_mms: 20,
        cutPower_pct: 70,
        engraveSpeed_mms: 250,
        engravePower_pct: 20,
        lineInterval_mm: 0.08
      }))
    };
    onUpdateMaterials([...materials, newMat]);
  };

  // Add Fixed Cost
  const handleAddFixedCost = () => {
    const newFc: FixedCost = {
      id: 'fc-' + Date.now(),
      name: 'Nova Despesa Fixa',
      amount: 500,
      category: 'Outros',
      periodicity: 'Mensal'
    };
    onUpdateFixedCosts([...fixedCosts, newFc]);
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
          <button
            onClick={() => setActiveTab('plans')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition shrink-0 cursor-pointer ${
              activeTab === 'plans' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Planos Comerciais
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
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
                onClick={handleAddMachine}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Nova Máquina
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {machines.map((mach, index) => {
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
                          const next = [...machines];
                          next[index].name = e.target.value;
                          onUpdateMachines(next);
                        }}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-sm font-bold text-slate-900 w-2/3 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => handleRemoveMachine(mach.id)}
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
                            const next = [...machines];
                            next[index].laserPowerW = Number(e.target.value);
                            onUpdateMachines(next);
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
                            const next = [...machines];
                            next[index].workAreaX_mm = Number(e.target.value);
                            onUpdateMachines(next);
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
                            const next = [...machines];
                            next[index].workAreaY_mm = Number(e.target.value);
                            onUpdateMachines(next);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Preço Compra (R$)</label>
                        <input
                          type="number"
                          value={mach.purchasePrice}
                          onChange={e => {
                            const next = [...machines];
                            next[index].purchasePrice = Number(e.target.value);
                            onUpdateMachines(next);
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
                            const next = [...machines];
                            next[index].monthlyWorkHours = Number(e.target.value);
                            onUpdateMachines(next);
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
                            const next = [...machines];
                            next[index].energyConsumptionKwh = Number(e.target.value);
                            onUpdateMachines(next);
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
                            const next = [...machines];
                            next[index].tubeSpareCost = Number(e.target.value);
                            onUpdateMachines(next);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Calculated Hourly and Per-Second Cost Badge */}
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
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
                    </div>
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
                onClick={handleAddMaterial}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl shadow-sm transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Material
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {materials.map((mat, index) => {
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
                            const next = [...materials];
                            next[index].name = e.target.value;
                            onUpdateMaterials(next);
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
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
                      <div>
                        <label className="text-[10px] text-slate-500 block mb-0.5">Largura Chapa (mm)</label>
                        <input
                          type="number"
                          value={mat.sheetWidth_mm}
                          onChange={e => {
                            const next = [...materials];
                            next[index].sheetWidth_mm = Number(e.target.value);
                            onUpdateMaterials(next);
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
                            const next = [...materials];
                            next[index].sheetLength_mm = Number(e.target.value);
                            onUpdateMaterials(next);
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
                            const next = [...materials];
                            next[index].unitCost = Number(e.target.value);
                            onUpdateMaterials(next);
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
                            const next = [...materials];
                            next[index].shippingCost = Number(e.target.value);
                            onUpdateMaterials(next);
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
                            const next = [...materials];
                            next[index].lossPercentage = Number(e.target.value);
                            onUpdateMaterials(next);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-900 font-mono focus:outline-none"
                        />
                      </div>
                    </div>
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
                  onClick={handleAddFixedCost}
                  className="flex items-center gap-1 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-600" /> Adicionar Despesa
                </button>
              </div>

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
                        const next = [...taxes];
                        next[idx].active = e.target.checked;
                        onUpdateTaxes(next);
                      }}
                      className="rounded border-slate-300 text-amber-500 focus:ring-0"
                    />
                    <div>
                      <p className="font-semibold text-slate-900">{t.name}</p>
                      <p className="text-[10px] text-slate-500">{t.regime}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      value={t.percentage}
                      onChange={e => {
                        const next = [...taxes];
                        next[idx].percentage = Number(e.target.value);
                        onUpdateTaxes(next);
                      }}
                      className="bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-900 font-mono font-bold w-20 focus:outline-none"
                    />
                    <span className="font-mono text-slate-500">%</span>
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

        {/* TAB 6: PLANOS COMERCIAIS */}
        {activeTab === 'plans' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-amber-600" />
                Matriz de Planos Comerciais CNC APP (v2.0)
              </h3>
              <p className="text-xs text-slate-500">
                Alterne entre planos para testar limites e comportamentos de tela
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {PLANS.map(plan => {
                const isActive = currentPlanId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-5 border flex flex-col justify-between transition ${
                      isActive
                        ? 'bg-amber-50/50 border-amber-500 shadow-md ring-1 ring-amber-500'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-extrabold text-slate-900 text-sm">{plan.name}</h4>
                        {isActive && (
                          <span className="text-[9px] bg-amber-500 text-white font-bold px-1.5 py-0.5 rounded">
                            Atual
                          </span>
                        )}
                      </div>
                      <div className="text-xl font-extrabold text-amber-700 font-mono mb-3">
                        R$ {plan.priceMonthly.toFixed(2)}
                        <span className="text-[10px] text-slate-400 font-sans font-normal">/mês</span>
                      </div>

                      <div className="text-[11px] space-y-1.5 mb-4 text-slate-600">
                        <p>👥 <strong>{plan.usersLimit}</strong> usuário(s)</p>
                        <p>📦 Até <strong>{plan.productsLimit || 'CAD'}</strong> produtos</p>
                        <p>⚡ <strong>{plan.aiCreditsMonthly}</strong> créditos IA/mês</p>
                        <p>🧾 {plan.hasInvoices ? '✅ NF-e Ilimitada' : '❌ Sem NF-e'}</p>
                        <p>🛒 {plan.hasMarketplaces ? '✅ ML e Shopee' : '❌ Sem Marketplaces'}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => onSwitchPlan(plan.id)}
                      className={`w-full py-1.5 text-xs font-bold rounded-xl transition cursor-pointer ${
                        isActive
                          ? 'bg-amber-500 text-white shadow-sm'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                      }`}
                    >
                      {isActive ? 'Plano Selecionado' : 'Simular Plano'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
