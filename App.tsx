
import React, { useState, useRef, useEffect } from 'react';
import { 
  Download, 
  Type, 
  Upload,
  FileText,
  LayoutTemplate,
  PenTool,
  Settings,
  Trash2,
  Plus,
  Image as ImageIcon,
  FolderOpen,
  CheckSquare,
  Square,
  Filter,
  Check,
  X,
  AlertCircle,
  List,
  Bold,
  Italic,
  QrCode,
  FileBadge,
  Database,
  UploadCloud,
  DownloadCloud,
  AlertTriangle,
  Github,
  Monitor,
  PenLine,
  Building,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Edit2,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
  Copy,
  FileCode,
  Import,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  FileStack,
  Files,
  Globe,
  ExternalLink,
  MessageSquare,
  Bot,
  Send,
  Calendar,
  Menu
} from 'lucide-react';
import { jsPDF } from "jspdf";
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { 
  CanvasElement, 
  ElementType, 
  FontStyle, 
  SavedSignature, 
  CertificateProject, 
  CertificateSide,
  Company 
} from './types';
import { TEMPLATES, FONTS, FONT_WEIGHTS } from './constants';
import CanvasEditor from './components/CanvasEditor';
import SignaturePad from './components/SignaturePad'; 

type ViewMode = 'template' | 'settings' | 'fill' | 'projects';
type Side = 'front' | 'back';
type ExportMode = 'single' | 'separate';

const DEFAULT_WIDTH = 2000;
const DEFAULT_HEIGHT = 1414;
const APP_VERSION = "v1.4.0-vps"; 
const GITHUB_URL = "https://github.com/szgnemin1/ProCertify";

const createNewProject = (name: string): CertificateProject => {
  return {
    id: Date.now().toString(),
    name: name,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    createdAt: Date.now(),
    filenamePattern: 'Sertifika-{Ad Soyad}', 
    front: {
      id: `front-${Date.now()}`,
      name: 'Ön Yüz',
      bgUrl: TEMPLATES[0].bgUrl,
      elements: [
         { id: '1', type: ElementType.TEXT, content: '{AD SOYAD}', x: 800, y: 600, width: 400, height: 100, fontSize: 80, fontFamily: FontStyle.SERIF, color: '#000000', fontWeight: 700, fontStyle: 'normal', textAlign: 'center', label: 'Ad Soyad' },
      ]
    },
    back: {
      id: `back-${Date.now()}`,
      name: 'Arka Yüz',
      bgUrl: '', 
      elements: []
    }
  };
};

const getApiUrl = (endpoint: string) => {
  let base = window.location.pathname;
  if(base.endsWith('/')) base = base.slice(0, -1);
  return `${base}${endpoint}`;
};

const downloadFile = async (blob: Blob | ArrayBuffer, defaultFilename: string, mimeType: string, preAcquiredHandle?: any) => {
  if (preAcquiredHandle) {
    try {
      const writable = await preAcquiredHandle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err) {
      console.error("Failed to write to pre-acquired handle, falling back to standard download...", err);
    }
  } else if ('showSaveFilePicker' in window) {
    try {
      const ext = defaultFilename.split('.').pop() || '';
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: ext.toUpperCase() + ' Dosyası',
          accept: {
            [mimeType]: [`.${ext}`]
          }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (err: any) {
      if (err.name === 'AbortError') {
         // Kullanıcı kaydetmeyi iptal etti
         return false;
      }
      console.warn("showSaveFilePicker failed, falling back to standard download...", err);
    }
  }

  // Fallback to standard <a> tag click
  const fileBlob = blob instanceof Blob ? blob : new Blob([blob], { type: mimeType });
  const url = URL.createObjectURL(fileBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return true;
};

const App = () => {
  const [projectFrontSelections, setProjectFrontSelections] = useState<Record<string, string>>({});
  const [projectBackSelections, setProjectBackSelections] = useState<Record<string, string>>({});

  const getActiveSideData = (project: CertificateProject | undefined, side: Side, useFillSelection: boolean = false): CertificateSide | null => {
    if (!project) return null;
    
    const sideData = side === 'front' ? project.front : project.back;
    const variants = side === 'front' ? project.frontVariants : project.backVariants;
    
    let selectedId: string | undefined;
    if (side === 'front') {
        selectedId = useFillSelection && projectFrontSelections[project.id] !== undefined 
            ? projectFrontSelections[project.id] 
            : project.selectedFrontId;
    } else {
        selectedId = useFillSelection && projectBackSelections[project.id] !== undefined 
            ? projectBackSelections[project.id] 
            : project.selectedBackId;
    }
    
    let bgUrl = sideData.bgUrl;
    let name = sideData.name;

    if (selectedId && variants && variants.length > 0) {
        const variant = variants.find(v => v.id === selectedId);
        if (variant) {
            bgUrl = variant.bgUrl;
            name = variant.name;
        }
    }
    
    return {
        ...sideData,
        bgUrl,
        name
    };
  };
  // --- Global State ---
  const [projects, setProjects] = useState<CertificateProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>('');
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [apiFetchFailed, setApiFetchFailed] = useState(false);

  const [selectedFillProjectIds, setSelectedFillProjectIds] = useState<string[]>([]);
  const [previewSides, setPreviewSides] = useState<Record<string, Side>>({});
  const [exportMode, setExportMode] = useState<ExportMode>('single');
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);

  // Initialize selectedFillProjectIds if empty and active project exists
  useEffect(() => {
    if (activeProjectId && selectedFillProjectIds.length === 0) {
        setSelectedFillProjectIds([activeProjectId]);
    }
  }, [activeProjectId]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  // UI State
  const [activeSide, setActiveSide] = useState<Side>('front');
  const [currentView, setCurrentView] = useState<ViewMode>('fill');
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [showSigPermissions, setShowSigPermissions] = useState(false); 
  const [showOptionManager, setShowOptionManager] = useState(false); 
  const [showSignaturePad, setShowSignaturePad] = useState(false); 
  const [tempOptionInput, setTempOptionInput] = useState(''); 
  const [isEditingName, setIsEditingName] = useState(false); 
  const [showChoiceFields, setShowChoiceFields] = useState(false);
  
  // Signatures State
  const [signatures, setSignatures] = useState<SavedSignature[]>([]);

  // Company List State
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tempCompanyInput, setTempCompanyInput] = useState('');
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  
  // Settings - Password State
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  // Settings - App System Update State
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateLogs, setUpdateLogs] = useState<{ stdout: string; stderr: string; success: boolean } | null>(null);

  // Settings - QR Code Base URL State
  const [qrBaseUrl, setQrBaseUrl] = useState(() => localStorage.getItem('vps_qr_base_url') || (window.location.origin + '/dogrula.html'));


  // --- Editor State ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.4);
  
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const variantFileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const htmlTemplateInputRef = useRef<HTMLInputElement>(null);

  // --- Fill State ---
  const [mobileFillStep, setMobileFillStep] = useState<0 | 1 | 2>(0);
  const [fillValues, setFillValues] = useState<Record<string, string>>({});
  const [isChatMode, setIsChatMode] = useState(true);
  const [chatHistory, setChatHistory] = useState<{id: string, sender: 'bot'|'user', text: string}[]>([]);
  const [currentChatStep, setCurrentChatStep] = useState(0);
  const [chatInputValue, setChatInputValue] = useState('');
  const [chatOptionSearch, setChatOptionSearch] = useState('');
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [isFillSidebarOpen, setIsFillSidebarOpen] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const unifiedFieldsRef = useRef<string>('');

  // Helper to parse dates from chatInputValue
  const getSelectedDatesFromText = (text: string) => {
    const dates: string[] = [];
    if (!text) return dates;
    const parts = text.split(' - ');
    for (const part of parts) {
      const match = part.match(/^([\d.]+)\/(\d{2})\/(\d{4})$/);
      if (match) {
        const daysStr = match[1];
        const month = match[2];
        const year = match[3];
        const days = daysStr.split('.');
        for (const d of days) {
          if(d) dates.push(`${year}-${month}-${d.padStart(2, '0')}`);
        }
      }
    }
    return dates;
  };

  // Helper to format dates back to chatInputValue
  const generateTextFromDates = (dateStrings: string[]) => {
    if (!dateStrings || dateStrings.length === 0) return '';
    const sorted = [...dateStrings].sort();
    const groups: Record<string, string[]> = {};
    for (const ds of sorted) {
      const [y, m, d] = ds.split('-');
      const key = `${m}/${y}`;
      if (!groups[key]) groups[key] = [];
      const dayFormatted = d.replace(/^0+/, ''); // Remove leading zeros if preferred or keep them? 
      // User said 22.23.24. Usually if it was 01,02,03 it stayed.
      // Let's keep the day as it is but ensure it's not duplicated.
      if (!groups[key].includes(d)) groups[key].push(d);
    }
    const parts = [];
    for (const key in groups) {
      const days = groups[key].join('.');
      parts.push(`${days}/${key}`);
    }
    return parts.join(' - ');
  };

  const toggleDateSelection = (dateString: string) => {
    const currentDates = getSelectedDatesFromText(chatInputValue);
    let newDates;
    if (currentDates.includes(dateString)) {
      newDates = currentDates.filter(d => d !== dateString);
    } else {
      newDates = [...currentDates, dateString];
    }
    setChatInputValue(generateTextFromDates(newDates));
  };

  // --- PERSISTENCE ---
  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      let data: any = null;
      let isNetworkError = false;
      try {
        const token = localStorage.getItem('vps_session_token');
        const res = await fetch(getApiUrl('/api/data'), {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        if (res.ok) {
          data = await res.json();
          console.log("FETCHED DATA FROM API:", data);
        } else if (res.status === 401) {
          console.error("Token expired or invalid. Logging out.");
          localStorage.removeItem('vps_session');
          localStorage.removeItem('vps_session_token');
          window.location.reload();
          return;
        } else {
          isNetworkError = true;
          console.error("API responded with not ok:", res.status);
        }
      } catch (error) {
        console.error("API network error:", error);
        isNetworkError = true;
      }

      if (isNetworkError) {
          setApiFetchFailed(true);
      }

      if (data && data.projects && Array.isArray(data.projects) && data.projects.length > 0) {
          console.log("Setting projects from API data", data.projects.length);
          setProjects(data.projects);
          setActiveProjectId(data.projects[0].id);
          if (data.signatures) setSignatures(data.signatures);
          if (data.companies) setCompanies(data.companies);
      } else if (!isNetworkError) {
          console.log("Data invalid or empty, creating new default project", data);
          const newP = createNewProject('Yeni Sertifika Projesi');
          setProjects([newP]);
          setActiveProjectId(newP.id);
      }
      setIsDataLoaded(true);
    };
    fetchData();
  }, []);

  // Save data on change
  useEffect(() => {
    if (!isDataLoaded || apiFetchFailed) return;

    const saveData = async () => {
      const dataObj = { projects, signatures, companies };
      console.log("SAVING DATA TO API:", dataObj);
      
      try {
        const token = localStorage.getItem('vps_session_token');
        const result = await fetch(getApiUrl('/api/data'), {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(dataObj)
        });
        if (result.status === 401) {
          localStorage.removeItem('vps_session');
          localStorage.removeItem('vps_session_token');
          window.location.reload();
          return;
        }
        console.log("SAVE DATA RESULT:", await result.text());
      } catch (error) {
        console.error("Failed to save data to API:", error);
      }
    };

    const timer = setTimeout(saveData, 2500);
    return () => clearTimeout(timer);
  }, [projects, signatures, companies, isDataLoaded]);

  useEffect(() => {
     if (isDataLoaded && !projects.find(p => p.id === activeProjectId) && projects.length > 0) {
        setActiveProjectId(projects[0].id);
     }
  }, [projects, activeProjectId, isDataLoaded]);

  useEffect(() => {
    if (isEditingName && projectNameInputRef.current) {
        projectNameInputRef.current.focus();
    }
  }, [isEditingName]);

  useEffect(() => {
    if (currentView !== 'template' || !activeProject) return;

    const handleResize = () => {
      if (editorContainerRef.current) {
        const { clientWidth, clientHeight } = editorContainerRef.current;
        const padding = 80;
        const scaleX = (clientWidth - padding) / activeProject.width;
        const scaleY = (clientHeight - padding) / activeProject.height;
        setScale(Math.min(scaleX, scaleY));
      }
    };
    const debouncedResize = () => requestAnimationFrame(handleResize);
    
    setTimeout(handleResize, 100);
    window.addEventListener('resize', debouncedResize);
    return () => window.removeEventListener('resize', debouncedResize);
  }, [activeProject?.width, activeProject?.height, currentView]);


  // --- Functions ---
  const normalizeKey = (key: string) => {
      return key.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
  };

  const turkishToLower = (str: string): string => {
      if (!str) return '';
      return str
          .replace(/İ/g, 'i')
          .replace(/I/g, 'ı')
          .replace(/Ğ/g, 'ğ')
          .replace(/Ü/g, 'ü')
          .replace(/Ş/g, 'ş')
          .replace(/Ö/g, 'ö')
          .replace(/Ç/g, 'ç')
          .toLocaleLowerCase('tr-TR');
  };

  const maskTCKN = (tckn: string) => {
      if (!tckn || tckn.length < 5) return tckn;
      const first2 = tckn.substring(0, 2);
      const last2 = tckn.substring(tckn.length - 2);
      const mask = '*'.repeat(tckn.length - 4);
      return `${first2}${mask}${last2}`;
  };

  const updateProjectSide = (side: Side, updates: Partial<CertificateSide>) => {
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
          const sideKey = side === 'front' ? 'front' : 'back';
          return {
              ...p,
              [sideKey]: { ...p[sideKey], ...updates }
          };
      }
      return p;
    }));
  };

  const handleAddBackgroundVariant = (side: Side, url: string, name?: string) => {
    if (!activeProjectId) return;
    const variantsKey = side === 'front' ? 'frontVariants' : 'backVariants';
    const selectedIdKey = side === 'front' ? 'selectedFrontId' : 'selectedBackId';
    
    const variantName = name || prompt(`${side === 'front' ? 'Ön' : 'Arka'} varyant ismi:`, `Yeni Varyant`);
    if (!variantName) return;

    const newId = `bg-var-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newVariant: BackgroundVariant = {
        id: newId,
        name: variantName,
        bgUrl: url
    };

    setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
            return {
                ...p,
                [variantsKey]: [...(p[variantsKey] || []), newVariant],
                [selectedIdKey]: newId
            };
        }
        return p;
    }));
  };

  const handleRenameVariant = (side: Side, id: string, name: string) => {
      const variantsKey = side === 'front' ? 'frontVariants' : 'backVariants';
      setProjects(prev => prev.map(p => {
          if (p.id === activeProjectId) {
              const variants = p[variantsKey] || [];
              const newVariants = variants.map(v => v.id === id ? { ...v, name } : v);
              return { ...p, [variantsKey]: newVariants };
          }
          return p;
      }));
  };

  const handleDeleteVariant = (side: Side, id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const variantsKey = side === 'front' ? 'frontVariants' : 'backVariants';
      const selectedIdKey = side === 'front' ? 'selectedFrontId' : 'selectedBackId';
      
      if (confirm("Bu arkaplan seçeneğini silmek istediğinize emin misiniz?")) {
          setProjects(prev => prev.map(p => {
              if (p.id === activeProjectId) {
                   const newVariants = (p[variantsKey] || []).filter(v => v.id !== id);
                   let newSelectedId = p[selectedIdKey] === id ? (newVariants[0]?.id || undefined) : p[selectedIdKey];
                   return {
                       ...p,
                       [variantsKey]: newVariants,
                       [selectedIdKey]: newSelectedId
                   };
              }
              return p;
          }));
      }
  };

  const handleSelectVariant = (side: Side, id: string) => {
      const selectedIdKey = side === 'front' ? 'selectedFrontId' : 'selectedBackId';
      updateProjectMeta({ [selectedIdKey]: id });
  };

  const updateProjectMeta = (updates: Partial<CertificateProject>) => {
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
            return { ...p, ...updates };
        }
        return p;
      }));
  };

  const updateProjectElements = (side: Side, newElements: CanvasElement[]) => {
    updateProjectSide(side, { elements: newElements });
  };

  const handleOrientationChange = (orientation: 'landscape' | 'portrait') => {
      const currentIsLandscape = activeProject.width > activeProject.height;
      
      if ((orientation === 'landscape' && currentIsLandscape) || 
          (orientation === 'portrait' && !currentIsLandscape)) {
          return;
      }
      updateProjectMeta({
          width: activeProject.height,
          height: activeProject.width
      });
  };

  const togglePreviewSide = (projectId: string) => {
      setPreviewSides(prev => ({
          ...prev,
          [projectId]: prev[projectId] === 'back' ? 'front' : 'back'
      }));
  };

  const getProjectLabels = () => {
    const labelMap = new Map<string, string>(); 
    const activeBack = getActiveSideData(activeProject, 'back');
    [activeProject?.front, activeBack].forEach(side => {
        if (!side) return;
        side.elements.forEach(el => {
            if (el.label) {
                const norm = normalizeKey(el.label);
                if (el.type === ElementType.TEXT || el.type === ElementType.DROPDOWN || el.type === ElementType.SIGNATURE || el.type === ElementType.TCKN || el.type === ElementType.COMPANY || el.type === ElementType.CHOICE_BOX) {
                    if (!labelMap.has(norm)) labelMap.set(norm, el.label);
                }
                if (el.type === ElementType.COMPANY) {
                    const shortKey = normalizeKey(`${el.label}_Kisa`);
                    if (!labelMap.has(shortKey)) labelMap.set(shortKey, `${el.label}_Kisa`);
                }
            }
        });
    });
    return Array.from(labelMap.values());
  };

  // --- CRUD Actions ---
  const handleCreateProject = () => {
    const newP = createNewProject(`Sertifika - ${new Date().toLocaleTimeString()}`);
    setProjects(prev => [...prev, newP]);
    setActiveProjectId(newP.id);
    setCurrentView('template');
  };

  const handleDuplicateProject = (id: string, e?: React.MouseEvent) => {
      if (e) e.stopPropagation();
      const projectToClone = projects.find(p => p.id === id);
      if (!projectToClone) return;
      const newProject: CertificateProject = {
          ...JSON.parse(JSON.stringify(projectToClone)),
          id: Date.now().toString(),
          name: `${projectToClone.name} (Kopya)`,
          createdAt: Date.now()
      };
      setProjects(prev => [...prev, newProject]);
  };

  const handleDeleteProject = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (projects.length <= 1) {
      alert("En az bir proje kalmalıdır. Silmeden önce yeni bir proje oluşturun.");
      return;
    }
    if (confirm("Bu projeyi kalıcı olarak silmek istediğinize emin misiniz?")) {
      setProjects(prev => prev.filter(p => p.id !== id));
      setSelectedFillProjectIds(prev => prev.filter(pid => pid !== id));
    }
  };

  // --- Element Management ---
  const handleVariantUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    Array.from(files).forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
            const url = evt.target.result as string;
            const defaultName = file.name.split('.')[0] || `Varyant ${index + 1}`;
            handleAddBackgroundVariant(activeSide, url, defaultName);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
            const url = evt.target.result as string;
            setProjects(prev => prev.map(p => {
                if (p.id === activeProjectId) {
                    const sideKey = activeSide === 'front' ? 'front' : 'back';
                    const variantsKey = activeSide === 'front' ? 'frontVariants' : 'backVariants';
                    const selectedIdKey = activeSide === 'front' ? 'selectedFrontId' : 'selectedBackId';
                    
                    if (p[selectedIdKey]) {
                        return {
                            ...p,
                            [variantsKey]: (p[variantsKey] || []).map(v => v.id === p[selectedIdKey] ? { ...v, bgUrl: url } : v)
                        };
                    } else {
                        return {
                            ...p,
                            [sideKey]: { ...p[sideKey], bgUrl: url }
                        };
                    }
                }
                return p;
            }));
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const addElement = (type: ElementType) => {
    if (type === ElementType.IMAGE) {
      logoInputRef.current?.click();
      return;
    }
    const content = type === ElementType.TEXT ? '{METİN}' 
                    : (type === ElementType.DROPDOWN ? '{SEÇENEK}' 
                    : (type === ElementType.COMPANY ? '{FİRMA}' 
                    : (type === ElementType.TCKN ? '{TCKN}' 
                    : (type === ElementType.CHOICE_BOX ? 'Evet' 
                    : (type === ElementType.QRCODE ? '{Sistem URL}?id={Seri No}' : '')))));
    
    const width = (type === ElementType.SIGNATURE || type === ElementType.QRCODE) ? 200 : (type === ElementType.CHOICE_BOX ? 40 : 400);
    const height = (type === ElementType.SIGNATURE) ? 100 : (type === ElementType.QRCODE ? 200 : (type === ElementType.CHOICE_BOX ? 40 : 100));
    
    const newEl: CanvasElement = {
      id: Date.now().toString(),
      type,
      content,
      x: activeProject.width / 2 - (width/2),
      y: activeProject.height / 2 - (height/2),
      width,
      height,
      fontSize: 60,
      fontFamily: FontStyle.SANS,
      color: '#000000',
      label: type === ElementType.TEXT ? 'Metin' 
              : (type === ElementType.SIGNATURE ? 'İmza' 
              : (type === ElementType.DROPDOWN ? 'Seçenek' 
              : (type === ElementType.COMPANY ? 'Firma'
              : (type === ElementType.TCKN ? 'TC Kimlik No'
              : (type === ElementType.CHOICE_BOX ? 'Seçim Kutusu'
              : (type === ElementType.QRCODE ? 'QR' : 'Görsel')))))),
      options: type === ElementType.DROPDOWN ? [] : (type === ElementType.CHOICE_BOX ? ['Evet', 'Hayır'] : undefined),
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'center',
      secondaryX: type === ElementType.CHOICE_BOX ? (activeProject.width / 2 - (width/2)) + 150 : undefined,
      secondaryY: type === ElementType.CHOICE_BOX ? (activeProject.height / 2 - (height/2)) : undefined,
    };

    const sideData = getActiveSideData(activeProject, activeSide);
    const currentElements = sideData?.elements || [];
    updateProjectElements(activeSide, [...currentElements, newEl]);
    setSelectedId(newEl.id);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
           const img = new Image();
           img.src = evt.target.result as string;
           img.onload = () => {
             const baseW = 300;
             const baseH = (img.height / img.width) * baseW;
             const newEl: CanvasElement = {
                id: Date.now().toString(),
                type: ElementType.IMAGE,
                content: evt.target!.result as string,
                x: activeProject.width / 2 - 150,
                y: activeProject.height / 2 - (baseH/2),
                width: baseW,
                height: baseH,
                label: 'Logo'
             };
             const sideData = getActiveSideData(activeProject, activeSide);
             const currentElements = sideData?.elements || [];
             updateProjectElements(activeSide, [...currentElements, newEl]);
           };
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updateElement = (id: string, updates: Partial<CanvasElement>) => {
    const sideData = getActiveSideData(activeProject, activeSide);
    const elements = sideData?.elements || [];
    const newElements = elements.map(el => el.id === id ? { ...el, ...updates } : el);
    updateProjectElements(activeSide, newElements);
  };

  const deleteElement = (id: string) => {
    const sideData = getActiveSideData(activeProject, activeSide);
    const elements = sideData?.elements || [];
    updateProjectElements(activeSide, elements.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedId || currentView !== 'template') return;
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) return;

      const step = e.shiftKey ? 10 : 1; 
      let dx = 0; let dy = 0;
      if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else return; 
      e.preventDefault();
      const sideData = getActiveSideData(activeProject, activeSide);
      const currentElement = sideData?.elements.find(el => el.id === selectedId);
      if (currentElement) {
          const updates: Partial<CanvasElement> = { x: currentElement.x + dx, y: currentElement.y + dy };
          if (currentElement.type === ElementType.CHOICE_BOX) {
              updates.secondaryX = (currentElement.secondaryX || currentElement.x) + dx;
              updates.secondaryY = (currentElement.secondaryY || currentElement.y) + dy;
          }
          updateElement(selectedId, updates);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, activeProjectId, activeSide, projects, currentView]); 

  // --- Unified Fill Logic ---
  const getUnifiedFillFields = () => {
    const fields: Record<string, { 
        type: ElementType, 
        label: string, 
        displayLabel: string, 
        allowedSignatureIds?: string[],
        options?: string[],
        defaultValue?: string
    }> = {};
    const targetProjects = projects.filter(p => selectedFillProjectIds.includes(p.id));
    targetProjects.forEach(proj => {
        const activeBack = getActiveSideData(proj, 'back');
        [proj.front, activeBack].forEach(side => {
            if (!side) return;
            side.elements.forEach(el => {
                const rawLabelOriginal = el.label || el.id;
                const normalizeCheck = normalizeKey(rawLabelOriginal);
                if (normalizeCheck === normalizeKey('Seri No') || normalizeCheck === normalizeKey('Seri Numarasi') || normalizeCheck === normalizeKey('Sertifika No')) return;

                if (el.type === ElementType.SIGNATURE || el.type === ElementType.DROPDOWN || el.type === ElementType.COMPANY || el.type === ElementType.CHOICE_BOX || el.type === ElementType.TCKN) {
                    const rawLabel = el.label || el.id;
                    const key = normalizeKey(rawLabel); 
                    const structuredField = {
                        type: el.type,
                        label: key,
                        displayLabel: rawLabel, 
                        allowedSignatureIds: el.allowedSignatureIds,
                        options: el.options,
                        defaultValue: el.content
                    };
                    if (!fields[key]) fields[key] = structuredField;
                    else if (fields[key].type === ElementType.TEXT) fields[key] = structuredField;
                    else if (fields[key].type === el.type) {
                        if (el.allowedSignatureIds) fields[key].allowedSignatureIds = Array.from(new Set([...(fields[key].allowedSignatureIds || []), ...el.allowedSignatureIds]));
                        if (el.options) fields[key].options = Array.from(new Set([...(fields[key].options || []), ...el.options]));
                    }
                }
                if (el.type === ElementType.TEXT || el.type === ElementType.QRCODE) {
                    const regex = /{([^{}]+)}/g;
                    let match;
                    while ((match = regex.exec(el.content)) !== null) {
                        const rawKey = match[1];
                        const key = normalizeKey(rawKey); 
                        if (key.endsWith('_kisa') || key === normalizeKey('Sistem URL') || key === normalizeKey('Seri No') || key === normalizeKey('Seri Numarasi') || key === normalizeKey('Sertifika No')) continue; 
                        if (!fields[key]) fields[key] = { type: ElementType.TEXT, label: key, displayLabel: rawKey.trim() };
                    }
                }
            });
        });
    });
    return Object.values(fields);
  };

  // --- Chat Mode Logic ---
  useEffect(() => {
    const fields = getUnifiedFillFields();
    const fieldsKey = fields.map(f => f.label).join(',');
    
    if (fieldsKey !== unifiedFieldsRef.current) {
      const isInitial = !unifiedFieldsRef.current;
      unifiedFieldsRef.current = fieldsKey;
      if (fields.length === 0) {
        setChatHistory([{ id: Date.now().toString(), sender: 'bot', text: 'Lütfen doldurmak için sol üstten proje seçin.' }]);
        setCurrentChatStep(0);
      } else {
        setFillValues(prevFill => {
            let nextIndex = 0;
            while (nextIndex < fields.length && (prevFill[fields[nextIndex].label] !== undefined && prevFill[fields[nextIndex].label] !== '')) {
                nextIndex++;
            }
            setCurrentChatStep(nextIndex);
            
            setChatHistory(prevHistory => {
               const newHistory = isInitial ? [] : [...prevHistory];
               if (isInitial && nextIndex === 0) {
                   newHistory.push({ id: Date.now().toString(), sender: 'bot', text: `Merhaba! Seçili projeler için ${fields.length} adet bilgiye ihtiyacım var. İlk olarak, lütfen **${fields[0].displayLabel}** giriniz.` });
               } else if (nextIndex < fields.length) {
                   newHistory.push({ id: Date.now().toString(), sender: 'bot', text: `Yeni alanlar eklendi. Lütfen **${fields[nextIndex].displayLabel}** giriniz.` });
               } else {
                   newHistory.push({ id: Date.now().toString(), sender: 'bot', text: `Tüm gerekli bilgileri girdiniz. Sağ alt köşeden PDF oluşturabilirsiniz.` });
               }
               return newHistory;
            });
            return prevFill;
        });
      }
    }
  }, [selectedFillProjectIds, projects]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, isChatMode]);

  const handleChatSubmit = (value: string, displayLabel?: string, isSkip: boolean = false) => {
    if (!value.trim() && !isSkip) return;
    const fields = getUnifiedFillFields();
    const currentField = fields[currentChatStep];
    if (!currentField) return;

    const userText = isSkip ? "(Cevapsız Bırakıldı)" : (displayLabel || value);
    const newHistory = [...chatHistory, { id: Date.now().toString(), sender: 'user' as const, text: userText }];

    if (!isSkip) {
      setFillValues(prev => ({ ...prev, [currentField.label]: value }));
    } else {
      setFillValues(prev => ({ ...prev, [currentField.label]: '' }));
    }

    const nextStep = currentChatStep + 1;
    setCurrentChatStep(nextStep);

    if (nextStep < fields.length) {
      const nextField = fields[nextStep];
      newHistory.push({ id: (Date.now() + 1).toString(), sender: 'bot' as const, text: `Teşekkürler. Şimdi lütfen **${nextField.displayLabel}** giriniz.` });
    } else {
      newHistory.push({ id: (Date.now() + 1).toString(), sender: 'bot' as const, text: `Harika! Tüm bilgileri aldım. Sağ alt köşeden PDF oluşturabilirsiniz.` });
    }

    setChatHistory(newHistory);
    setChatInputValue('');
    setChatOptionSearch('');
  };

  const handleChatUndo = () => {
    if (currentChatStep === 0) return;
    const prevStep = currentChatStep - 1;
    setCurrentChatStep(prevStep);
    
    setChatHistory(prev => prev.slice(0, Math.max(1, prev.length - 2)));
    
    const fields = getUnifiedFillFields();
    if (fields[prevStep]) {
      setFillValues(prev => {
        const next = { ...prev };
        delete next[fields[prevStep].label];
        return next;
      });
    }
    setChatInputValue('');
    setChatOptionSearch('');
  };

  if (!isDataLoaded) {
      return (
          <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
              <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p>Yükleniyor...</p>
                  <button onClick={() => window.location.reload()} className="mt-4 text-xs text-slate-500 hover:text-white underline">Uzun sürdüyse tıklayın</button>
              </div>
          </div>
      );
  }

  if (!activeProject) {
      return (
          <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
              <div className="text-center p-8 bg-slate-800 rounded-xl border border-slate-700 shadow-2xl">
                  <AlertTriangle className="mx-auto mb-4 text-amber-500" size={48} />
                  <h2 className="text-xl font-bold mb-2">Proje Yüklenemedi</h2>
                  <p className="text-slate-400 mb-6">Veriler yüklenirken bir sorun oluştu veya proje bulunamadı.</p>
                  <button 
                      onClick={() => {
                          const newP = createNewProject('Yeni Sertifika Projesi');
                          setProjects([newP]);
                          setActiveProjectId(newP.id);
                      }}
                      className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-bold transition"
                  >
                      Yeni Proje Oluştur ve Sıfırla
                  </button>
              </div>
          </div>
      );
  } 

  // --- Modals & Options ---
  const toggleAllowedSignature = (elementId: string, sigId: string) => {
      const sideData = getActiveSideData(activeProject, activeSide);
      const element = sideData?.elements.find(el => el.id === elementId);
      if (!element) return;
      const currentAllowed = element.allowedSignatureIds || [];
      let newAllowed;
      if (currentAllowed.includes(sigId)) newAllowed = currentAllowed.filter(id => id !== sigId);
      else newAllowed = [...currentAllowed, sigId];
      updateElement(elementId, { allowedSignatureIds: newAllowed });
  };

  const addOption = (elementId: string) => {
      if (!tempOptionInput.trim()) return;
      const sideData = getActiveSideData(activeProject, activeSide);
      const element = sideData?.elements.find(el => el.id === elementId);
      if (!element) return;
      const currentOptions = element.options || [];
      updateElement(elementId, { options: [...currentOptions, tempOptionInput.trim()] });
      setTempOptionInput('');
  };

  const removeOption = (elementId: string, index: number) => {
      const sideData = getActiveSideData(activeProject, activeSide);
      const element = sideData?.elements.find(el => el.id === elementId);
      if (!element || !element.options) return;
      const newOptions = element.options.filter((_, i) => i !== index);
      updateElement(elementId, { options: newOptions });
  };

  const addCompany = (input: string) => {
      if (!input.trim()) return;
      const lines = input.split('\n').map(n => n.trim()).filter(n => n.length > 0);
      const newCompanies: Company[] = [];
      lines.forEach(line => {
          let name = line; let short = line;
          if (line.includes('|')) {
              const parts = line.split('|');
              name = parts[0].trim();
              short = parts[1].trim() || name;
          }
          newCompanies.push({ id: Date.now().toString() + Math.random(), name: name, shortName: short });
      });
      setCompanies(prev => {
          const existingNames = new Set(prev.map(p => p.name));
          const uniqueNew = newCompanies.filter(c => !existingNames.has(c.name));
          return [...prev, ...uniqueNew]; 
      });
      setTempCompanyInput('');
  };

  const removeCompany = (id: string) => {
      setCompanies(prev => prev.filter(c => c.id !== id));
  };

  const handleSignatureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((item) => {
        const file = item as File;
        const reader = new FileReader();
        reader.onload = (evt) => {
            if (evt.target?.result) {
                setSignatures(prev => [...prev, {
                    id: Date.now().toString() + Math.random(),
                    name: file.name.split('.')[0],
                    url: evt.target!.result as string
                }]);
            }
        };
        reader.readAsDataURL(file);
      });
    }
  };
  
  const handleSignatureDrawSave = (dataUrl: string) => {
      setSignatures(prev => [...prev, {
          id: Date.now().toString(),
          name: `İmza ${new Date().toLocaleTimeString()}`,
          url: dataUrl
      }]);
      setShowSignaturePad(false);
  };

  const deleteSignature = (id: string) => {
      setSignatures(prev => prev.filter(s => s.id !== id));
  };
  
  const handlePasswordChange = async () => {
      if (newPassword.trim() === '') {
          setPasswordMessage('Lütfen geçerli bir şifre girin.');
          return;
      }
      try {
          const token = localStorage.getItem('vps_session_token');
          const res = await fetch(getApiUrl('/api/change-password'), {
              method: 'POST',
              headers: { 
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({ newPassword })
          });
          if (res.status === 401) {
             localStorage.removeItem('vps_session');
             localStorage.removeItem('vps_session_token');
             window.location.reload();
             return;
          }
          const data = await res.json();
          if (data.success) {
              setPasswordMessage('Şifre başarıyla güncellendi!');
              setNewPassword('');
          } else {
              setPasswordMessage('Şifre güncellenemedi: ' + data.error);
          }
      } catch (e) {
          setPasswordMessage('Sunucu ile iletişim kurulamadı.');
      }
      setTimeout(() => setPasswordMessage(''), 3000);
  };

  const handleUpdateApp = async () => {
      setIsUpdating(true);
      setUpdateMessage('GitHub güncellemesi çekiliyor ve derleniyor... Lütfen bekleyin.');
      setUpdateLogs(null);
      
      try {
          const token = localStorage.getItem('vps_session_token');
          const res = await fetch(getApiUrl('/api/update-app'), {
              method: 'POST',
              headers: { 
                 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${token}`
              }
          });
          
          if (res.status === 401) {
             localStorage.removeItem('vps_session');
             localStorage.removeItem('vps_session_token');
             window.location.reload();
             return;
          }
          
          const data = await res.json();
          if (res.ok && data.success) {
              setUpdateMessage(data.message || 'Güncelleme başarıyla uygulandı! Sayfa 5 saniye içinde yenilenecektir...');
              setUpdateLogs({ stdout: data.stdout, stderr: data.stderr, success: true });
              setTimeout(() => {
                  window.location.reload();
              }, 5000);
          } else {
              setUpdateMessage('Güncelleme başarısız oldu. Log detayını aşağıda görebilirsiniz.');
              setUpdateLogs({ 
                  stdout: data.stdout || '', 
                  stderr: data.stderr || data.error || 'Bilinmeyen bir sunucu hatası.',
                  success: false 
              });
          }
      } catch (e: any) {
          // It's possible the server killed itself to restart, so we show success if it responded nicely, 
          // but if we caught an error while updating, we inform the user to check back.
          setUpdateMessage('Sunucu ile bağlantı kesildi. (Güncelleme başarılı olup yeniden başlatılıyor olabilir.)');
          setUpdateLogs({ 
              stdout: 'Bağlantı koptu.', 
              stderr: e.message || 'Sunucu yeniden başlıyor...', 
              success: true 
          });
          setTimeout(() => {
              window.location.reload();
          }, 6000);
      } finally {
          setIsUpdating(false);
      }
  };

  // --- IMPORT/EXPORT LOGIC ---
  
  const handleSaveTemplateAsHTML = async () => {
     const json = JSON.stringify(activeProject, null, 2);
     const blob = new Blob([json], { type: 'application/json' });
     await downloadFile(blob, `Sertifika_Sablon_${activeProject.name.replace(/\s+/g, '_')}.json`, 'application/json');
  };

  const handleImportHTMLTemplate = (e: React.ChangeEvent<HTMLInputElement>) => {
     const file = e.target.files?.[0];
     if (!file) return;
     const reader = new FileReader();
     reader.onload = (evt) => {
         try {
             const parsed = JSON.parse(evt.target?.result as string);
             if (parsed.id && parsed.front) {
                 const newProject = { ...parsed, id: Date.now().toString(), name: parsed.name + ' (İçe Aktarılan)' };
                 setProjects(prev => [...prev, newProject]);
                 setActiveProjectId(newProject.id);
                 alert('Şablon başarıyla yüklendi!');
             } else {
                 alert('Geçersiz şablon dosyası.');
             }
         } catch(e) { console.error(e); alert('Dosya okunamadı.'); }
     };
     reader.readAsText(file);
     e.target.value = '';
  };

  // FULL SYSTEM BACKUP EXPORT
  const handleExportBackup = async () => {
    try {
        const backupData = {
            version: APP_VERSION,
            timestamp: Date.now(),
            projects,
            signatures,
            companies
        };
        const dataStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        
        // Fix filename to be safe for Windows filesystems (no colons)
        const dateStr = new Date().toISOString().replace(/[:.]/g, '-');
        await downloadFile(blob, `ProCertify_Yedek_${dateStr}.json`, 'application/json');
    } catch (error) {
        console.error("Yedekleme hatası:", error);
        alert("Yedek dosyası oluşturulurken bir hata oluştu.");
    }
  };

  // FIXED: FULL SYSTEM BACKUP IMPORT
  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Explicit confirm
    if(!confirm("DİKKAT: Bu işlem mevcut tüm projelerinizi ve ayarlarınızı SİLECEK ve yedek dosyasındakileri yükleyecektir.\n\nDevam etmek istiyor musunuz?")) {
        if(e.target) e.target.value = ''; // Reset input so same file can be selected again
        return;
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
        try {
            const jsonString = evt.target?.result as string;
            const data = JSON.parse(jsonString);

            // Basic Validation
            if(!data.projects || !Array.isArray(data.projects)) {
                throw new Error("Geçersiz yedek dosyası formatı.");
            }

            const dataObj = {
                projects: data.projects,
                signatures: data.signatures || [],
                companies: data.companies || []
            };

            // Save to API backend if available
            try {
                const token = localStorage.getItem('vps_session_token');
                const res = await fetch(getApiUrl('/api/data'), {
                    method: 'POST',
                    headers: { 
                       'Content-Type': 'application/json',
                       'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(dataObj)
                });
                if (res.status === 401) {
                  localStorage.removeItem('vps_session');
                  localStorage.removeItem('vps_session_token');
                  window.location.reload();
                  return;
                }
                if (!res.ok) {
                    throw new Error("Server rejected the data. Status: " + res.status);
                }
            } catch (error) {
                console.error("Failed to save imported backup to API", error);
                alert("Uyarı: Sunucuya kaydedilemedi!\n" + String(error));
            }

            // Update state
            setProjects(data.projects);
            setSignatures(dataObj.signatures);
            setCompanies(dataObj.companies);
            
            if (data.projects && data.projects.length > 0) {
                setActiveProjectId(data.projects[0].id);
            }
            
            alert("Yedek başarıyla yüklendi!");
            window.location.reload();

        } catch(e) {
            console.error("Backup Import Error:", e);
            alert("Hata: Yedek dosyası okunamadı veya bozuk. Lütfen geçerli bir .json dosyası seçin.");
        } finally {
             // Reset input value to allow selecting the same file again
             if (backupInputRef.current) {
                 backupInputRef.current.value = '';
             }
        }
    };
    reader.readAsText(file);
  };

  const formatContent = (pattern: string, values: Record<string, string>) => {
      if (!pattern) return '';
      return pattern.replace(/{([^{}]+)}/g, (match, rawLabel) => {
         const label = normalizeKey(rawLabel); 
         if (label === normalizeKey('Sistem URL')) return qrBaseUrl;

         const isShortRequest = label.endsWith('_kisa');
         const cleanLabel = isShortRequest ? label.replace('_kisa', '') : label;
         let val = values[cleanLabel];
         
         // Preview handling for system-generated fields
         if (val === undefined && (cleanLabel === normalizeKey('Seri No') || cleanLabel === normalizeKey('Seri Numarasi') || cleanLabel === normalizeKey('Sertifika No'))) {
             return 'PRC-XXXXXXXX';
         }
         
         if (val === undefined) return match;
         if (val.startsWith('data:')) {
             const sig = signatures.find(s => s.url === val);
             return sig ? sig.name : 'Gorsel'; 
         }
         if (isShortRequest) {
             const company = companies.find(c => turkishToLower(c.name) === turkishToLower(val));
             if (company) return company.shortName;
             return val; 
         }
         return val; 
      });
  };

  const generateFilename = (pattern: string, values: Record<string, string>) => {
      const name = formatContent(pattern, values);
      return name.replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\-\. ]/gi, '_') + '.pdf';
  };

  const getWrappedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
      const rawLines = text.split('\n');
      const finalLines: string[] = [];
      rawLines.forEach(rawLine => {
          const words = rawLine.split(' ');
          let currentLine = words[0];
          for (let i = 1; i < words.length; i++) {
              const word = words[i];
              const width = ctx.measureText(currentLine + " " + word).width;
              if (width < maxWidth) currentLine += " " + word;
              else { finalLines.push(currentLine); currentLine = word; }
          }
          finalLines.push(currentLine);
      });
      return finalLines;
  };

  const renderProjectToPDF = async (pdf: jsPDF, proj: CertificateProject, isFirstInDoc: boolean, activeValues: Record<string, string> = fillValues) => {
        const sides: Side[] = ['front', 'back'];
        const activeBackData = getActiveSideData(proj, 'back', true);
        const hasBack = activeBackData && (activeBackData.bgUrl || activeBackData.elements.length > 0);
        const sidesToPrint = hasBack ? sides : ['front'];
        let pageAddedForProj = false;
        let firstPageImgData = '';

        for (const side of sidesToPrint) {
            if (!isFirstInDoc || pageAddedForProj) {
                pdf.addPage([proj.width, proj.height], proj.width > proj.height ? 'landscape' : 'portrait');
            }
            pageAddedForProj = true;

            const sideData = getActiveSideData(proj, side as Side, true);
            if (!sideData) continue;

            const canvas = document.createElement('canvas');
            canvas.width = proj.width;
            canvas.height = proj.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            if (sideData.bgUrl) {
                const bgImg = new Image();
                bgImg.src = sideData.bgUrl;
                await new Promise<void>(resolve => {
                    bgImg.onload = () => {
                        ctx.drawImage(bgImg, 0, 0, proj.width, proj.height);
                        resolve();
                    };
                    bgImg.onerror = () => resolve();
                });
            } else {
                 ctx.fillStyle = "#ffffff";
                 ctx.fillRect(0,0, proj.width, proj.height);
            }

            for (const el of sideData.elements) {
                let content = '';

                if (el.type === ElementType.QRCODE || el.type === ElementType.TEXT) {
                   content = formatContent(el.content, activeValues);
                } else {
                   const key = normalizeKey(el.label || '');
                   content = activeValues[key] || el.content;
                }

                if (el.type === ElementType.SIGNATURE && !content) continue;

                // HANDLE CHOICE BOX PDF RENDER
                if (el.type === ElementType.CHOICE_BOX) {
                    ctx.font = `${el.fontWeight || 400} ${el.fontSize}px ${el.fontFamily?.split(',')[0]}`;
                    ctx.fillStyle = el.color || '#000';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const opt1 = el.options?.[0] || 'Evet';
                    const isOpt1 = content === opt1;
                    
                    const tickX = isOpt1 ? el.x : (el.secondaryX || el.x + 100);
                    const tickY = isOpt1 ? el.y : (el.secondaryY || el.y);
                    
                    ctx.fillText("✓", tickX + (el.width/2), tickY + (el.height/2));
                    continue; 
                }

                if (el.type === ElementType.TEXT || el.type === ElementType.DROPDOWN || el.type === ElementType.COMPANY || el.type === ElementType.TCKN) {
                    ctx.font = `${el.fontStyle === 'italic' ? 'italic ' : ''}${el.fontWeight || 400} ${el.fontSize}px ${el.fontFamily?.split(',')[0]}`;
                    ctx.fillStyle = el.color || '#000';
                    const align = el.textAlign || 'center';
                    ctx.textAlign = align as CanvasTextAlign;
                    ctx.textBaseline = 'top'; 
                    
                    let textToRender = content || '';
                    if (el.type === ElementType.TCKN) {
                        textToRender = maskTCKN(textToRender);
                    }

                    const allLines = getWrappedLines(ctx, textToRender, el.width);
                    let startX = el.x; 
                    if (align === 'center') startX = el.x + (el.width / 2);
                    if (align === 'right') startX = el.x + el.width;
                    const startY = el.y; 
                    const lineHeight = el.fontSize! * 1.2;

                    allLines.forEach((line, idx) => {
                        ctx.fillText(line, startX, startY + (idx * lineHeight));
                    });
                } else if (el.type === ElementType.QRCODE) {
                    try {
                        const qrDataUrl = await QRCode.toDataURL(content || ' ', {
                             width: el.width, margin: 1,
                             color: { dark: el.color || '#000000', light: '#00000000' }
                        });
                        const img = new Image();
                        img.src = qrDataUrl;
                         await new Promise<void>(resolve => {
                            img.onload = () => { ctx.drawImage(img, el.x, el.y, el.width, el.height); resolve(); };
                            img.onerror = () => resolve(); 
                        });
                    } catch (e) { console.error("QR Export Error", e); }
                } else {
                    const img = new Image();
                    img.src = content;
                    await new Promise<void>(resolve => {
                        img.onload = () => { ctx.drawImage(img, el.x, el.y, el.width, el.height); resolve(); };
                        img.onerror = () => resolve();
                    });
                }
            }
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            if (!firstPageImgData) firstPageImgData = imgData;
            pdf.addImage(imgData, 'JPEG', 0, 0, proj.width, proj.height);
        }
        return firstPageImgData;
  };

  const getVerificationPayload = (values: Record<string, string>) => {
      const payload = { ...values };
      for (const [k, v] of Object.entries(payload)) {
          if (v && v.startsWith('data:image/')) {
              const sig = signatures.find(s => s.url === v);
              payload[k] = sig ? sig.name : 'Görsel Mevcut';
          }
      }
      return payload;
  };

  const exportPDF = async () => {
    if (isGenerating) return; // Prevent double clicks
    const targetProjects = projects.filter(p => selectedFillProjectIds.includes(p.id));
    if (targetProjects.length === 0) return;

    let fileHandle = null;
    let exportFilename = '';
    
    // 1. Masaüstü tarayıcılarda dosya seçme penceresini AÇMAK İÇİN
    // user gesture (tıklama) kaybolmadan hemen önce dosyayı nereye kaydedeceğini soruyoruz.
    try {
        if (exportMode === 'single') {
            const firstProj = targetProjects[0];
            exportFilename = generateFilename(firstProj.filenamePattern || 'Sertifikalar_Birlestirilmis', fillValues);
            
            if ('showSaveFilePicker' in window) {
                fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: exportFilename,
                    types: [{ description: 'PDF Dosyası', accept: { 'application/pdf': ['.pdf'] } }]
                });
            }
        } else {
            exportFilename = `Sertifikalar_${new Date().getTime()}.zip`;
            if ('showSaveFilePicker' in window) {
                fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: exportFilename,
                    types: [{ description: 'ZIP Dosyası', accept: { 'application/zip': ['.zip'] } }]
                });
            }
        }
    } catch (err: any) {
        if (err.name === 'AbortError') {
            return; // Kullanıcı iptal etti, işlemi durdur
        }
        console.warn("Dosya seçici açılamadı, varsayılan indirme kullanılacak...", err);
    }

    setIsGenerating(true);
    setProgress(0);
    // Yield to let UI update
    await new Promise(r => setTimeout(r, 50));

    try {
        if (exportMode === 'single') {
            const firstProj = targetProjects[0];
            const filename = generateFilename(firstProj.filenamePattern || 'Sertifikalar_Birlestirilmis', fillValues);

            const pdf = new jsPDF({
                orientation: firstProj.width > firstProj.height ? 'landscape' : 'portrait',
                unit: 'px',
                format: [firstProj.width, firstProj.height]
            });

            for (let i = 0; i < targetProjects.length; i++) {
                const proj = targetProjects[i];
                
                const baseSerial = Math.floor(10000000 + Math.random() * 90000000).toString();
                const serialNo = `PRC-${baseSerial}`;
                const activeValues = { ...fillValues, 'seri no': serialNo, 'seri numarasi': serialNo, 'sertifika no': serialNo };

                const certImage = await renderProjectToPDF(pdf, proj, i === 0, activeValues);

                let companyVal = '';
                for (const [k, v] of Object.entries(activeValues)) {
                    if (v && typeof v === 'string') {
                        const lk = k.toLowerCase();
                        if (lk.includes('firma') || lk.includes('kurum') || lk.includes('şirket') || lk.includes('sirket') || lk.includes('company')) {
                            companyVal = v;
                            break;
                        }
                    }
                }

                if (localStorage.getItem('vps_session') === 'authenticated') {
                    try {
                        const token = localStorage.getItem('vps_session_token');
                        await fetch(getApiUrl('/api/issue'), {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                serialNo,
                                company: companyVal,
                                fields: getVerificationPayload(activeValues),
                                projects: [proj.name],
                                date: new Date().toISOString(),
                                image: certImage
                            })
                        });
                    } catch (e) {
                       console.error("Backend issue error", e);
                    }
                }
                
                // Important yield for UI responsiveness
                if (i % 2 === 0) {
                    setProgress(Math.round(((i + 1) / targetProjects.length) * 100));
                    await new Promise(r => setTimeout(r, 0));
                }
            }
            
            const pdfBlob = pdf.output('blob');
            await downloadFile(pdfBlob, exportFilename, 'application/pdf', fileHandle);

        } else {
            const zip = new JSZip();
            let savedCount = 0;
            const usedNames = new Set<string>();

            for (const proj of targetProjects) {
                // Generate unique Serial Number for this certificate
                const baseSerial = Math.floor(10000000 + Math.random() * 90000000).toString();
                const serialNo = `PRC-${baseSerial}`;
                const activeValues = { ...fillValues, 'seri no': serialNo, 'seri numarasi': serialNo, 'sertifika no': serialNo };

                // Create a fresh instance for each file to keep memory low
                const pdf = new jsPDF({
                    orientation: proj.width > proj.height ? 'landscape' : 'portrait',
                    unit: 'px',
                    format: [proj.width, proj.height]
                });

                const certImage = await renderProjectToPDF(pdf, proj, true, activeValues);

                let companyVal = '';
                for (const [k, v] of Object.entries(activeValues)) {
                    if (v && typeof v === 'string') {
                        const lk = k.toLowerCase();
                        if (lk.includes('firma') || lk.includes('kurum') || lk.includes('şirket') || lk.includes('sirket') || lk.includes('company')) {
                            companyVal = v;
                            break;
                        }
                    }
                }

                // Save to verification system
                if (localStorage.getItem('vps_session') === 'authenticated') {
                    try {
                        const token = localStorage.getItem('vps_session_token');
                        await fetch(getApiUrl('/api/issue'), {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                serialNo,
                                company: companyVal,
                                fields: getVerificationPayload(activeValues),
                                projects: [proj.name],
                                date: new Date().toISOString(),
                                image: certImage
                            })
                        });
                    } catch (e) {
                       console.error("Backend issue error", e);
                    }
                }
                // Generate base filename
                let rawName = generateFilename(proj.filenamePattern || `Sertifika-${proj.name}`, activeValues);
                let baseName = rawName.replace(/\.pdf$/i, '');
                baseName = baseName.replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\-\. _]/gi, '_');

                let uniqueName = `${baseName}.pdf`;
                let counter = 1;
                
                // Prevent overwriting files in the same batch
                while (usedNames.has(uniqueName)) {
                    uniqueName = `${baseName}_${counter}.pdf`;
                    counter++;
                }
                usedNames.add(uniqueName);

                const pdfData = pdf.output('arraybuffer');
                
                // Add to zip
                zip.file(uniqueName, pdfData);
                savedCount++;
                
                // Update progress and yield execution to UI thread
                setProgress(Math.round(((savedCount) / targetProjects.length) * 100));
                await new Promise(r => setTimeout(r, 0));
            }

            setProgress(99); // Generating zip
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            await downloadFile(zipBlob, exportFilename, 'application/zip', fileHandle);

            alert(`${savedCount} adet dosya başarıyla ZIP olarak indirildi!`);
        }
    } catch (e: any) {
        console.error("Export failed", e);
        alert("PDF oluşturulurken bir hata oluştu: " + (e.message || String(e)));
    } finally {
        setIsGenerating(false);
        setProgress(0);
    }
  };

  const currentSideData = getActiveSideData(activeProject, activeSide);
  const currentSideElements = currentSideData?.elements || [];
  const currentSideBg = currentSideData?.bgUrl || '';
  const selectedElement = currentSideElements.find(el => el.id === selectedId);

  const getPreviewElements = (proj: CertificateProject, side: Side, useFill: boolean = true) => {
    const sideData = getActiveSideData(proj, side, useFill);
    if (!sideData) return [];
    return sideData.elements.map(el => {
      if (el.type === ElementType.QRCODE || el.type === ElementType.TEXT) {
         return { ...el, content: formatContent(el.content, fillValues) };
      }
      const key = normalizeKey(el.label || '');
      const val = fillValues[key];
      if (el.type === ElementType.TCKN) {
          if (val) return { ...el, content: maskTCKN(val) };
          return el;
      }
      if (val) return { ...el, content: val };
      return el; 
    });
  };

  return (
    <div className="flex flex-col md:flex-row h-[100dvh] bg-slate-900 text-slate-200 overflow-hidden font-sans selection:bg-amber-500/30 w-full relative">
      
      {/* MOBILE HEADER */}
      <div className="md:hidden flex items-center justify-between p-4 bg-slate-950 border-b border-slate-800 shrink-0 z-40 w-full">
         <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-700 rounded-lg flex items-center justify-center shadow-lg">
               <FileText className="text-white" size={16} />
            </div>
            <span className="font-bold text-white text-lg tracking-tight">ProCertify</span>
         </div>
         <button onClick={() => setIsMobileNavOpen(true)} className="p-2 text-slate-400 hover:text-white transition bg-slate-900 rounded-lg border border-slate-700">
           <Menu size={20} />
         </button>
      </div>

      {/* MOBILE DRAWER OVERLAY */}
      {isMobileNavOpen && (
          <div 
            className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] animate-in fade-in transition-all" 
            onClick={() => setIsMobileNavOpen(false)}
          />
      )}

      {/* SIDEBAR NAVIGATION */}
      <div className={`fixed inset-y-0 left-0 z-[100] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 w-[240px] md:w-20 bg-slate-950 md:border-r border-slate-800 flex flex-col items-center py-6 px-4 md:px-0 gap-6 md:gap-8 shrink-0 select-none shadow-2xl md:shadow-none ${isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Mobile Sidebar Header */}
        <div className="flex md:hidden items-center justify-between w-full pb-4 border-b border-slate-800">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-amber-700 rounded-lg flex items-center justify-center shadow-lg">
                 <FileText className="text-white" size={16} />
              </div>
              <span className="font-bold text-white text-lg tracking-tight">Menü</span>
           </div>
           <button onClick={() => setIsMobileNavOpen(false)} className="p-1.5 text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition border border-slate-700">
             <X size={20} />
           </button>
        </div>

        <div className="hidden md:flex w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl items-center justify-center shadow-lg shadow-amber-900/40">
           <FileText className="text-white" size={24} />
        </div>
        
        <div className="flex flex-col w-full gap-2 flex-1 justify-start">
           <button onClick={() => { setCurrentView('projects'); setIsMobileNavOpen(false); }} className={`p-3 md:p-2 w-full flex justify-start md:justify-center md:flex-col items-center gap-3 md:gap-1 transition-all relative rounded-lg md:rounded-none ${currentView === 'projects' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 md:hover:bg-transparent'}`}><FolderOpen size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-sm md:text-[10px] font-medium block">Projeler</span>{currentView === 'projects' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r hidden md:block"></div>}</button>
           <button onClick={() => { setCurrentView('template'); setIsMobileNavOpen(false); }} className={`p-3 md:p-2 w-full flex justify-start md:justify-center md:flex-col items-center gap-3 md:gap-1 transition-all relative rounded-lg md:rounded-none ${currentView === 'template' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 md:hover:bg-transparent'}`}><LayoutTemplate size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-sm md:text-[10px] font-medium block">Şablon</span>{currentView === 'template' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r hidden md:block"></div>}</button>
           <button onClick={() => { setCurrentView('settings'); setIsMobileNavOpen(false); }} className={`p-3 md:p-2 w-full flex justify-start md:justify-center md:flex-col items-center gap-3 md:gap-1 transition-all relative rounded-lg md:rounded-none ${currentView === 'settings' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 md:hover:bg-transparent'}`}><Settings size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-sm md:text-[10px] font-medium block">Ayarlar</span>{currentView === 'settings' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r hidden md:block"></div>}</button>
           <button onClick={() => { setCurrentView('fill'); setIsMobileNavOpen(false); }} className={`p-3 md:p-2 w-full flex justify-start md:justify-center md:flex-col items-center gap-3 md:gap-1 transition-all relative rounded-lg md:rounded-none ${currentView === 'fill' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900 md:hover:bg-transparent'}`}><PenTool size={20} className="md:w-6 md:h-6 shrink-0" /><span className="text-sm md:text-[10px] font-medium block">Doldur</span>{currentView === 'fill' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r hidden md:block"></div>}</button>
        </div>
        <div className="flex flex-col items-center gap-2 pb-2 mt-auto"><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="text-slate-600 hover:text-white transition flex items-center md:block gap-2"><Github size={20} className="md:hidden"/><span className="md:hidden text-xs">GitHub'da Görüntüle</span></a><span className="text-[9px] text-slate-600 font-mono">{APP_VERSION}</span></div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* VIEW: PROJECTS LIST */}
        {currentView === 'projects' && (
             <div className="flex-1 bg-slate-900 p-4 md:p-10 overflow-y-auto">
                {/* ... existing project list UI ... */}
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-3xl font-bold mb-1 text-white">Projelerim</h1>
                            <p className="text-slate-400">Tüm sertifika çalışmalarınız burada.</p>
                        </div>
                        <button onClick={handleCreateProject} className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-lg flex items-center gap-2 font-bold transition shadow-lg shadow-amber-900/20 active:scale-95 transform"><Plus size={20} /> Yeni Proje</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {projects.map(p => (
                            <div key={p.id} onClick={() => { setActiveProjectId(p.id); setCurrentView('template'); }} className={`bg-slate-800 border-2 rounded-xl p-5 cursor-pointer transition group hover:shadow-xl hover:-translate-y-1 relative overflow-hidden ${activeProjectId === p.id ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-700 hover:border-slate-500'}`}>
                                <div className="h-40 bg-slate-900/50 rounded-lg mb-4 flex items-center justify-center overflow-hidden relative">
                                    {p.front.bgUrl ? <img src={p.front.bgUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition duration-500" /> : <FileText size={40} className="text-slate-700" />}
                                    <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white backdrop-blur">Ön Yüz</div>
                                </div>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0 pr-2">
                                        <h3 className="font-bold text-lg text-slate-100 group-hover:text-amber-500 transition truncate">{p.name}</h3>
                                        <p className="text-xs text-slate-500 mt-1">{new Date(p.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <button onClick={(e) => handleDuplicateProject(p.id, e)} className="p-2 text-slate-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-full transition shrink-0"><Copy size={18} /></button>
                                        <button onClick={(e) => handleDeleteProject(p.id, e)} className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition shrink-0"><Trash2 size={18} /></button>
                                    </div>
                                </div>
                                {activeProjectId === p.id && <div className="absolute top-0 right-0 bg-amber-500 text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">AKTİF</div>}
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

        {/* VIEW: TEMPLATE EDITOR */}
        {currentView === 'template' && (
          <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
            <div className="w-full md:w-72 h-[40vh] md:h-auto bg-slate-800 border-b md:border-b-0 md:border-r border-slate-700 flex flex-col z-20 shadow-xl flex-shrink-0 select-none">
               <div className="p-5 border-b border-slate-700 bg-slate-800 group relative">
                 {isEditingName ? (
                     <input ref={projectNameInputRef} type="text" value={activeProject.name} onChange={(e) => updateProjectMeta({ name: e.target.value })} onBlur={() => setIsEditingName(false)} onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)} className="w-full bg-slate-900 border border-amber-500 rounded px-2 py-1 text-sm text-white outline-none font-bold" />
                 ) : (
                     <div className="flex items-center justify-between group-hover:bg-slate-700/50 p-1 rounded -ml-1 cursor-pointer" onClick={() => setIsEditingName(true)}>
                         <div className="overflow-hidden"><h2 className="text-lg font-bold text-white truncate" title={activeProject.name}>{activeProject.name}</h2><p className="text-xs text-slate-400">Şablon Düzenleyici</p></div>
                         <Edit2 size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                     </div>
                 )}
               </div>
               
               <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
                 {/* ... Layout, Background, Components ... */}
                 <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Sayfa Düzeni</h3>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button onClick={() => handleOrientationChange('landscape')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition ${activeProject.width > activeProject.height ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><RectangleHorizontal size={16} /> Yatay</button>
                        <button onClick={() => handleOrientationChange('portrait')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition ${activeProject.height > activeProject.width ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><RectangleVertical size={16} /> Dikey</button>
                    </div>
                 </div>
                 <div className="h-[1px] bg-slate-700"></div>
                 <div className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Arkaplan ({activeSide === 'front' ? 'Ön' : 'Arka'})</h3>
                        <button onClick={() => variantFileInputRef.current?.click()} className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-500 px-2 py-1 rounded hover:bg-amber-500/20 transition">
                            <Plus size={12} /> Yeni Seçenek
                        </button>
                    </div>
                    <input type="file" ref={fileInputRef} onChange={handleTemplateUpload} accept="image/*" className="hidden" />
                    <input type="file" ref={variantFileInputRef} onChange={handleVariantUpload} accept="image/*" multiple className="hidden" />
                    
                    {activeProject && (
                        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto custom-scrollbar pr-1 -mx-1 px-1">
                            <div 
                                onClick={() => handleSelectVariant(activeSide, '')} 
                                className={`group flex items-center justify-between p-2 rounded text-[11px] cursor-pointer transition border ${!(activeSide === 'front' ? activeProject.selectedFrontId : activeProject.selectedBackId) ? 'bg-amber-500/10 border-amber-500/40 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                            >
                                <div className="flex items-center gap-2 truncate flex-1 font-medium">
                                    {!(activeSide === 'front' ? activeProject.selectedFrontId : activeProject.selectedBackId) ? <Check size={12} className="text-amber-500" /> : <div className="w-3 h-3" />}
                                    <span>Varsayılan Arkaplan</span>
                                </div>
                                <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-all">
                                    <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} className="p-1 text-slate-400 hover:text-amber-500 transition-all" title="Arkaplanı Değiştir">
                                        <Upload size={12} />
                                    </button>
                                    <button onClick={(e) => { 
                                        e.stopPropagation(); 
                                        if(confirm('Arkaplanı temizlemek istediğinize emin misiniz?')) {
                                            updateProjectSide(activeSide, { bgUrl: '' });
                                        }
                                    }} className="p-1 text-slate-400 hover:text-red-500 transition-all" title="Arkaplanı Temizle">
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>
                            
                            {(() => {
                                const side = activeSide;
                                const variantsKey = side === 'front' ? 'frontVariants' : 'backVariants';
                                const selectedKey = side === 'front' ? 'selectedFrontId' : 'selectedBackId';
                                const variants = activeProject[variantsKey] || [];
                                
                                return variants.map(v => {
                                    const isSelected = activeProject[selectedKey] === v.id;
                                    return (
                                        <div 
                                            key={v.id} 
                                            onClick={() => handleSelectVariant(side, v.id)} 
                                            className={`group flex items-center justify-between p-2 rounded text-[11px] cursor-pointer transition border ${isSelected ? 'bg-amber-500/10 border-amber-500/40 text-amber-200' : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'}`}
                                        >
                                            <div className="flex items-center gap-2 truncate flex-1">
                                                {isSelected ? <Check size={12} className="text-amber-500" /> : <div className="w-3 h-3" />}
                                                <input 
                                                    type="text" 
                                                    value={v.name || ''} 
                                                    onChange={(e) => {
                                                        e.stopPropagation();
                                                        handleRenameVariant(side, v.id, e.target.value);
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="bg-transparent border-none text-[11px] focus:outline-none w-full text-inherit font-medium underline decoration-transparent focus:decoration-amber-500/30"
                                                    placeholder="Varyant İsmi"
                                                />
                                            </div>
                                            <button onClick={(e) => handleDeleteVariant(side, v.id, e)} className="p-1 text-slate-400 hover:text-red-500 opacity-60 group-hover:opacity-100 transition-all" title="Varyantı Sil">
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    )}
                 </div>
                 <div className="h-[1px] bg-slate-700"></div>
                 <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Bileşen Ekle</h3>
                    <button onClick={() => addElement(ElementType.TEXT)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><Type size={18} /> Metin Alanı</button>
                    <button onClick={() => addElement(ElementType.DROPDOWN)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><List size={18} /> Seçenekli Alan</button>
                    <button onClick={() => addElement(ElementType.COMPANY)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><Building size={18} /> Firma Ekle</button>
                    <button onClick={() => addElement(ElementType.TCKN)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><ShieldCheck size={18} /> TC Kimlik No</button>
                    <button onClick={() => addElement(ElementType.CHOICE_BOX)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><CheckCircle2 size={18} /> Seçim Kutusu</button>
                    <button onClick={() => addElement(ElementType.QRCODE)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><QrCode size={18} /> QR Kod</button>
                    <button onClick={() => addElement(ElementType.SIGNATURE)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><PenTool size={18} /> İmza Alanı</button>
                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                    <button onClick={() => addElement(ElementType.IMAGE)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200"><ImageIcon size={18} /> Logo / Resim</button>
                 </div>
                 {/* QR & Filename Settings */}
                 {selectedElement && selectedElement.type === ElementType.QRCODE && (
                   <div className="space-y-3 mt-4 pt-4 border-t border-slate-700 animate-in fade-in slide-in-from-left-4">
                       <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2"><QrCode size={14} className="text-amber-500"/> QR İçerik Ayarları</h3>
                       <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 space-y-2">
                           <p className="text-[10px] text-slate-400">QR Koda eklenecek verileri seçin:</p>
                           <textarea rows={3} value={selectedElement.content} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none resize-none" placeholder="Örn: {Ad Soyad} - {Tarih}" />
                       </div>
                   </div>
                 )}
                 <div className="h-[1px] bg-slate-700 mt-4"></div>
                 <div className="space-y-3 mt-4">
                      <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2"><FileBadge size={14} /> Proje Ayarları & Çıktı</h3>
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 block">PDF Dosya Adı Formatı</label>
                          <input type="text" value={activeProject.filenamePattern || 'Sertifika-{Ad Soyad}'} onChange={(e) => updateProjectMeta({ filenamePattern: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none" placeholder="Örn: {Ad Soyad}-{Tarih}" />
                          <div className="text-[9px] text-slate-500 mb-1">Mevcut etiketleri ekle:</div>
                          <div className="flex flex-wrap gap-1">
                              {getProjectLabels().map(label => (
                                  <button key={label} onClick={() => { const current = activeProject.filenamePattern || ''; updateProjectMeta({ filenamePattern: current + `{${label}}` }); }} className={`text-[10px] px-2 py-0.5 rounded transition border border-slate-600 hover:border-slate-500 ${label.endsWith('_Kisa') ? 'bg-slate-800 text-amber-500 border-amber-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`} title={label.endsWith('_Kisa') ? "Firma kısaltmasını ekle" : "Değeri ekle"}>+ {label}</button>
                              ))}
                          </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <input type="file" ref={htmlTemplateInputRef} onChange={handleImportHTMLTemplate} accept=".json" className="hidden" />
                        <button onClick={() => htmlTemplateInputRef.current?.click()} className="w-full py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-[10px] font-bold shadow-sm border border-slate-600 flex items-center justify-center gap-1 transition"><Import size={12} /> ŞABLON YÜKLE</button>
                        <button onClick={handleSaveTemplateAsHTML} className="w-full py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-lg text-[10px] font-bold shadow-sm border border-purple-600 flex items-center justify-center gap-1 transition"><FileCode size={12} /> ŞABLON KAYDET</button>
                      </div>
                 </div>
               </div>
            </div>

            {/* Canvas Area with Top Properties Bar */}
            <div className="flex-1 flex flex-col relative bg-[#0b0f19]">
              <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center px-6 gap-4 justify-between relative select-none">
                 <div className="flex items-center gap-3 overflow-x-auto flex-1 no-scrollbar pr-4">
                     {selectedElement ? (
                    <>
                        {/* ... Properties Inputs (Font, Color, Align etc) ... */}
                        <span className="text-xs font-bold text-amber-500 uppercase whitespace-nowrap">{selectedElement.type === ElementType.COMPANY ? 'FİRMA' : (selectedElement.type === ElementType.CHOICE_BOX ? 'SEÇİM' : selectedElement.type)}</span>
                        <input value={selectedElement.label || ''} onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })} className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-32 focus:border-amber-500 outline-none shrink-0" placeholder="Etiket / Soru" />
                        {(selectedElement.type === ElementType.TEXT || selectedElement.type === ElementType.DROPDOWN || selectedElement.type === ElementType.QRCODE || selectedElement.type === ElementType.COMPANY || selectedElement.type === ElementType.TCKN || selectedElement.type === ElementType.CHOICE_BOX) && (
                        <>
                            <div className="w-[1px] h-6 bg-slate-600 mx-2 shrink-0"></div>
                            {selectedElement.type !== ElementType.QRCODE && (
                            <>
                                <select value={selectedElement.fontFamily} onChange={(e) => updateElement(selectedElement.id, { fontFamily: e.target.value })} className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-36 shrink-0">{FONTS.map(group => (<optgroup key={group.group} label={group.group}>{group.options.map(f => (<option key={f.value} value={f.value}>{f.name}</option>))}</optgroup>))}</select>
                                <select value={selectedElement.fontWeight || 400} onChange={(e) => updateElement(selectedElement.id, { fontWeight: Number(e.target.value) })} className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-24 shrink-0">{FONT_WEIGHTS.map(w => (<option key={w.value} value={w.value}>{w.name}</option>))}</select>
                                {selectedElement.type !== ElementType.CHOICE_BOX && (<div className="flex items-center bg-slate-900 rounded border border-slate-600 shrink-0"><button onClick={() => updateElement(selectedElement.id, { textAlign: 'left' })} className={`p-1.5 hover:bg-slate-700 ${selectedElement.textAlign === 'left' ? 'bg-slate-700 text-amber-500' : 'text-slate-400'}`}><AlignLeft size={16} /></button><div className="w-[1px] h-4 bg-slate-700"></div><button onClick={() => updateElement(selectedElement.id, { textAlign: 'center' })} className={`p-1.5 hover:bg-slate-700 ${(!selectedElement.textAlign || selectedElement.textAlign === 'center') ? 'bg-slate-700 text-amber-500' : 'text-slate-400'}`}><AlignCenter size={16} /></button><div className="w-[1px] h-4 bg-slate-700"></div><button onClick={() => updateElement(selectedElement.id, { textAlign: 'right' })} className={`p-1.5 hover:bg-slate-700 ${selectedElement.textAlign === 'right' ? 'bg-slate-700 text-amber-500' : 'text-slate-400'}`}><AlignRight size={16} /></button></div>)}
                                <button onClick={() => updateElement(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })} className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${selectedElement.fontStyle === 'italic' ? 'bg-slate-700 border-amber-500 text-amber-500' : 'bg-transparent border-transparent hover:bg-slate-800'}`}><Italic size={16} /></button>
                                <input type="number" value={Math.round(selectedElement.fontSize || 0)} onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-center shrink-0" title="Font Boyutu" />
                            </>
                            )}
                            <input type="color" value={selectedElement.color} onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })} className="w-8 h-8 rounded bg-transparent border-none cursor-pointer shrink-0" title="Renk" />
                            {selectedElement.type === ElementType.DROPDOWN && (<button onClick={() => setShowOptionManager(true)} className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded text-xs text-white border border-blue-600 ml-2 whitespace-nowrap transition"><List size={12} /> Seçenekleri Düzenle ({selectedElement.options?.length || 0})</button>)}
                            {selectedElement.type === ElementType.CHOICE_BOX && selectedElement.options && (<div className="flex items-center gap-2 ml-2 bg-slate-900 p-1 rounded border border-slate-600"><span className="text-[10px] text-slate-400">Varsayılan:</span><select value={selectedElement.content} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} className="bg-slate-800 border border-slate-600 rounded px-2 py-0.5 text-xs text-white outline-none">{selectedElement.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></div>)}
                            {selectedElement.type === ElementType.TEXT && (<input value={selectedElement.content} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-32 shrink-0" placeholder="Örn metin" />)}
                        </>
                        )}
                        {selectedElement.type === ElementType.SIGNATURE && (<button onClick={() => setShowSigPermissions(true)} className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs text-white border border-slate-600 ml-2 whitespace-nowrap transition"><Filter size={12} /> İmza İzinleri ({selectedElement.allowedSignatureIds?.length || 'Tümü'})</button>)}
                    </>
                    ) : <span className="text-sm text-slate-500">Özellikler için bileşen seçin</span>}
                 </div>
                 <div className="flex flex-col gap-2">
                    <div className="flex bg-slate-900 p-1 rounded-lg shrink-0">
                        <button onClick={() => { setActiveSide('front'); setSelectedId(null); }} className={`flex-1 px-4 py-1.5 text-xs rounded-md transition font-medium ${activeSide === 'front' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Ön Yüz</button>
                        <button onClick={() => { setActiveSide('back'); setSelectedId(null); }} className={`flex-1 px-4 py-1.5 text-xs rounded-md transition font-medium ${activeSide === 'back' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}>Arka Yüz</button>
                    </div>
                  </div>
              </div>
              <div ref={editorContainerRef} className="flex-1 overflow-hidden relative flex items-center justify-center p-4 md:p-10 bg-dots-pattern" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                <CanvasEditor elements={currentSideElements} width={activeProject.width} height={activeProject.height} bgUrl={currentSideBg} selectedId={selectedId} onSelect={setSelectedId} onUpdateElement={updateElement} onDeleteElement={deleteElement} scale={scale} />
              </div>
              {showSigPermissions && selectedElement && selectedElement.type === ElementType.SIGNATURE && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                      {/* ... Sig Permissions Modal ... */}
                      <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-[500px] max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                          <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl"><div><h3 className="font-bold text-white flex items-center gap-2"><Filter size={18} className="text-amber-500"/> İmza Kısıtlamaları</h3><p className="text-xs text-slate-400 mt-1">Bu alana (Etiket: {selectedElement.label}) hangi imzaların eklenebileceğini seçin.</p></div><button onClick={() => setShowSigPermissions(false)} className="p-2 hover:bg-slate-700 rounded-full transition text-slate-400 hover:text-white"><X size={20} /></button></div>
                          <div className="p-5 overflow-y-auto flex-1 space-y-3 bg-slate-900">
                               {signatures.length === 0 ? (<div className="text-center py-10 text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700 border-dashed"><AlertCircle className="mx-auto mb-2" />Henüz hiç imza yüklenmemiş.<div className="text-xs mt-2">Ayarlar sekmesinden imza yükleyebilirsiniz.</div></div>) : (
                                   <div className="grid grid-cols-1 gap-2">
                                       <div onClick={() => updateElement(selectedElement.id, { allowedSignatureIds: undefined })} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition ${!selectedElement.allowedSignatureIds || selectedElement.allowedSignatureIds.length === 0 ? 'bg-amber-900/20 border-amber-600/50' : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80'}`}>{(!selectedElement.allowedSignatureIds || selectedElement.allowedSignatureIds.length === 0) ? <CheckSquare size={20} className="text-amber-500" /> : <Square size={20} className="text-slate-600" />}<span className="font-medium text-sm">Tüm İmzalara İzin Ver</span></div>
                                       <div className="my-2 h-[1px] bg-slate-800"></div><div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">VEYA SEÇİMLİ İZİN VER</div>
                                       {signatures.map(sig => { const isChecked = selectedElement.allowedSignatureIds?.includes(sig.id); return (<div key={sig.id} onClick={() => toggleAllowedSignature(selectedElement.id, sig.id)} className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition ${isChecked ? 'bg-slate-800 border-amber-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}>{isChecked ? <CheckSquare size={20} className="text-green-500" /> : <Square size={20} className="text-slate-600" />}<div className="w-12 h-8 bg-white rounded p-1 flex items-center justify-center"><img src={sig.url} className="max-w-full max-h-full" alt="" /></div><span className="text-sm">{sig.name}</span></div>) })}
                                   </div>
                               )}
                          </div>
                          <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-xl flex justify-end"><button onClick={() => setShowSigPermissions(false)} className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-medium transition shadow-lg">Tamam</button></div>
                      </div>
                  </div>
              )}
              {showOptionManager && selectedElement && selectedElement.type === ElementType.DROPDOWN && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                      {/* ... Option Manager Modal ... */}
                      <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-[500px] max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                          <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl"><div><h3 className="font-bold text-white flex items-center gap-2"><List size={18} className="text-blue-500"/> Seçenek Yönetimi</h3><p className="text-xs text-slate-400 mt-1">Bu alan (Etiket: {selectedElement.label}) için kullanıcıların seçebileceği değerleri girin.</p></div><button onClick={() => setShowOptionManager(false)} className="p-2 hover:bg-slate-700 rounded-full transition text-slate-400 hover:text-white"><X size={20} /></button></div>
                          <div className="p-5 overflow-y-auto flex-1 bg-slate-900 flex flex-col gap-4">
                               <div className="flex gap-2"><input type="text" value={tempOptionInput} onChange={(e) => setTempOptionInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addOption(selectedElement.id)} className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none" placeholder="Yeni seçenek yazın..." autoFocus /><button onClick={() => addOption(selectedElement.id)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition">Ekle</button></div>
                               <div className="border-t border-slate-800 pt-2"><div className="text-xs font-bold text-slate-500 uppercase mb-2">MEVCUT SEÇENEKLER</div><div className="space-y-2">{!selectedElement.options || selectedElement.options.length === 0 ? (<div className="text-sm text-slate-500 italic text-center py-4">Henüz seçenek eklenmemiş.</div>) : (selectedElement.options.map((opt, idx) => (<div key={idx} className="flex justify-between items-center bg-slate-800 p-2 rounded-lg border border-slate-700 group hover:border-slate-600"><span className="text-sm">{opt}</span><button onClick={() => removeOption(selectedElement.id, idx)} className="text-slate-500 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition"><Trash2 size={14} /></button></div>)))}</div></div>
                          </div>
                          <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-xl flex justify-end"><button onClick={() => setShowOptionManager(false)} className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-2 rounded-lg font-medium transition">Kapat</button></div>
                      </div>
                  </div>
              )}
            </div>
          </div>
        )}

        {/* VIEW: SETTINGS */}
        {currentView === 'settings' && (
          <div className="flex-1 bg-slate-900 p-4 md:p-10 overflow-y-auto custom-scrollbar">
             <div className="max-w-4xl mx-auto space-y-8">
                <div><h1 className="text-3xl font-bold mb-2 text-white">Ayarlar & Varlıklar</h1><p className="text-slate-400">Uygulama genel ayarları ve varlık yönetimi.</p></div>
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                  <h2 className="text-xl font-semibold flex items-center gap-2 text-white mb-6">
                    <FileText className="text-blue-500" /> Aktif Proje Yönetimi
                  </h2>
                  <div className="w-full">
                    <label className="text-xs text-slate-400 font-bold uppercase mb-1 block">Proje İsmi</label>
                    <input 
                      type="text" 
                      value={activeProject.name} 
                      onChange={(e) => updateProjectMeta({ name: e.target.value })} 
                      className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-amber-500 outline-none" 
                    />
                    <p className="text-[10px] text-slate-500 mt-2">
                      Projeyi silmek için <button onClick={() => setCurrentView('projects')} className="text-amber-500 hover:underline">Projeler</button> sayfasına gidiniz.
                    </p>
                  </div>
                </div>

                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold flex items-center gap-2 text-white">
                      <Building className="text-green-500" /> Firma Listesi Yönetimi
                    </h2>
                    <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">Toplam: {companies.length}</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-4">Sertifikalarda kullanılacak firma/kurum isimlerini buraya ekleyin. Kısaltma belirlemek için "|" karakterini kullanın (Örn: "Acme Şirketi | Acme").</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase">Toplu Ekleme</label>
                      <textarea 
                        rows={6} 
                        value={tempCompanyInput} 
                        onChange={(e) => setTempCompanyInput(e.target.value)} 
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-sm text-white focus:border-green-500 outline-none resize-none font-mono" 
                        placeholder={"Firma Adı | Kısaltma\nÖrnek A.Ş. | Örnek\nSadece İsim"} 
                      />
                      <button 
                        onClick={() => addCompany(tempCompanyInput)} 
                        className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition shadow-lg shadow-green-900/20 active:scale-95"
                      >
                        Listeye Ekle
                      </button>
                    </div>
                    <div className="space-y-2 flex flex-col h-full">
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-bold text-slate-500 uppercase">Mevcut Liste</label>
                        {companies.length > 0 && (
                          <input 
                            type="text"
                            value={companySearchQuery}
                            onChange={(e) => setCompanySearchQuery(e.target.value)}
                            placeholder="Firma ara..."
                            className="bg-slate-900 border border-slate-700 rounded px-3 py-1 text-xs text-white placeholder-slate-500 focus:border-green-500 outline-none w-40 md:w-52 transition"
                          />
                        )}
                      </div>
                      <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-2 flex-1 max-h-[200px] overflow-y-auto custom-scrollbar space-y-1">
                        {(() => {
                          const searched = companies.filter(c => 
                            turkishToLower(c.name).includes(turkishToLower(companySearchQuery)) || 
                            (c.shortName && turkishToLower(c.shortName).includes(turkishToLower(companySearchQuery)))
                          );
                          if (searched.length === 0) {
                            return (
                              <div className="text-center py-8 text-slate-500 text-sm italic">
                                {companies.length === 0 ? "Liste boş." : "Aramayla eşleşen firma bulunamadı."}
                              </div>
                            );
                          }
                          return searched.map((company, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-slate-800 rounded group hover:bg-slate-700 transition">
                              <div className="flex flex-col truncate pr-2">
                                <span className="text-sm text-slate-200">{company.name}</span>
                                {company.shortName !== company.name && (
                                  <span className="text-[10px] text-slate-500 font-mono">Kısaltma: {company.shortName}</span>
                                )}
                              </div>
                              <button 
                                onClick={() => removeCompany(company.id)} 
                                className="text-slate-500 hover:text-red-500 p-1 opacity-60 group-hover:opacity-100 transition"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700"><div className="flex justify-between items-center mb-6"><h2 className="text-xl font-semibold flex items-center gap-2 text-white"><PenTool className="text-amber-500" /> Kayıtlı İmzalar</h2><div className="flex gap-2"><button onClick={() => setShowSignaturePad(true)} className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition shadow-sm border border-slate-600"><PenLine size={18} /> İmza Çiz</button><label className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 font-medium transition shadow-lg shadow-amber-900/20 active:scale-95 transform"><Plus size={18} /> İmza Yükle<input type="file" accept="image/*" multiple className="hidden" onChange={handleSignatureUpload} /></label></div></div>{signatures.length === 0 ? (<div className="text-center py-10 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50"><Upload className="mx-auto text-slate-600 mb-4" size={40} /><p className="text-slate-500 text-sm">Henüz hiç imza yüklenmemiş.</p></div>) : (<div className="grid grid-cols-2 md:grid-cols-4 gap-4">{signatures.map(sig => (<div key={sig.id} className="group relative bg-white rounded-xl p-4 flex items-center justify-center h-32 shadow-sm border border-slate-600 transition hover:border-amber-500/50"><img src={sig.url} alt={sig.name} className="max-h-full max-w-full object-contain" /><div className="absolute inset-0 bg-black/60 opacity-60 group-hover:opacity-100 transition flex items-center justify-center rounded-xl backdrop-blur-sm"><button onClick={() => deleteSignature(sig.id)} className="bg-red-500 p-2 rounded-full text-white hover:bg-red-600 shadow-lg transform active:scale-95 transition"><Trash2 size={20} /></button></div><div className="absolute bottom-2 left-2 right-2 text-center"><span className="text-[10px] bg-slate-900/90 text-white px-2 py-1 rounded truncate block border border-slate-700 shadow-sm">{sig.name}</span></div></div>))}</div>)}</div>
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 text-white"><QrCode className="text-teal-500" /> Doğrulama ve QR Ayarları</h2>
                    </div>
                    <p className="text-sm text-slate-400 mb-4">Sertifikalar oluşturulurken QR kodlara eklenecek temel web sitesi adresini buradan düzeltebilirsiniz. Sertifika üzerindeki QR kod, bu adres ve sertifika seri numarası ile oluşturulacaktır.</p>
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
                        <div className="w-full md:flex-1 space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Sistem Doğrulama URL'si</label>
                            <input 
                                type="text"
                                value={qrBaseUrl}
                                onChange={(e) => {
                                    setQrBaseUrl(e.target.value);
                                    localStorage.setItem('vps_qr_base_url', e.target.value);
                                }}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-teal-500 outline-none font-mono text-sm"
                                placeholder="http://194.146.36.153:5555/dogrula.html"
                            />
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2 text-white"><ShieldCheck className="text-red-500" /> Güvenlik Ayarları</h2>
                    </div>
                    <p className="text-sm text-slate-400 mb-4">Uygulamanıza erişim sağlayan yönetici şifrenizi buradan değiştirebilirsiniz. Değiştirdiğiniz şifre tarayıcınızda veya sistemde yerel olarak saklanacaktır.</p>
                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
                        <div className="w-full md:flex-1 space-y-2">
                            <label className="text-xs font-bold text-slate-500 uppercase">Yeni Şifre</label>
                            <input 
                                type="password" 
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-600 rounded-lg p-3 text-white focus:border-red-500 outline-none"
                                placeholder="Yeni Şifre Girin"
                            />
                        </div>
                        <button 
                            onClick={handlePasswordChange}
                            className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-medium transition shadow-lg shadow-red-900/20 active:scale-95 w-full md:w-auto shrink-0"
                        >
                            Şifreyi Değiştir
                        </button>
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-700">
                         <button 
                            onClick={() => {
                                localStorage.removeItem('vps_session');
                                window.location.reload();
                            }}
                            className="text-sm text-slate-400 hover:text-white underline decoration-slate-600 underline-offset-4"
                        >
                            Oturumu Kapat (Şifre Ekranına Dön)
                        </button>
                    </div>
                    {passwordMessage && (
                        <p className={`mt-3 text-sm ${passwordMessage.includes('başarıyla') ? 'text-green-500' : 'text-red-500'}`}>{passwordMessage}</p>
                    )}
                </div>

                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-white">
                        <Database className="text-blue-500" /> Yedekleme ve Geri Yükleme
                    </h2>
                    <p className="text-sm text-slate-400 mb-6">
                        Tüm projelerinizi, şablonlarınızı, ayarlarınızı ve yüklediğiniz görselleri (imzalar dahil) tek bir dosya olarak yedekleyin veya başka bir cihaza taşıyın.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center text-center hover:border-slate-600 transition">
                            <DownloadCloud size={40} className="text-green-500 mb-4" />
                            <h3 className="font-bold text-white mb-2">Sistemi Yedekle</h3>
                            <p className="text-xs text-slate-400 mb-4">Tüm verileri (projeler, görseller, ayarlar) içeren tek bir .json dosyası indirir.</p>
                            <button onClick={handleExportBackup} className="mt-auto bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition w-full shadow-lg shadow-green-900/20 active:scale-95">Yedek Dosyasını İndir</button>
                        </div>
                        <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center text-center hover:border-slate-600 transition">
                            <UploadCloud size={40} className="text-blue-500 mb-4" />
                            <h3 className="font-bold text-white mb-2">Yedeği Geri Yükle</h3>
                            <p className="text-xs text-slate-400 mb-4">Daha önce aldığınız yedek dosyasını seçerek tüm verilerinizi geri yükleyin.</p>
                            <div className="mt-auto w-full relative">
                                <input ref={backupInputRef} type="file" accept=".json" onChange={handleImportBackup} className="hidden" id="backup-upload" />
                                <label htmlFor="backup-upload" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition w-full flex items-center justify-center cursor-pointer shadow-lg shadow-blue-900/20 active:scale-95">Dosya Seç ve Yükle</label>
                            </div>
                            <div className="flex items-center gap-2 mt-3 text-[10px] text-amber-500">
                                <AlertTriangle size={12} /><span>Dikkat: Mevcut verilerin üzerine yazılacaktır.</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                     <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-white">
                         <Github className="text-white" /> Sunucu / GitHub Otomatik Güncelleme
                     </h2>
                     <p className="text-sm text-slate-400 mb-6">
                         Uygulamanın en son sürümünü GitHub deposundan (<span className="font-mono text-slate-300">szgnemin1/ProCertify</span>) çeker, arka planda otomatik olarak yeniden derler ve sunucu sürecini PM2 ile yeniden başlatır. Mevcut verileriniz (projeler, şablonlar, imzalar vb.) bu işlemden **etkilenmez**.
                     </p>
                     
                     <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 space-y-4">
                         <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                             <div>
                                 <h3 className="font-bold text-white mb-1">Tek Tıkla Otomatik Güncelleme</h3>
                                 <p className="text-xs text-slate-400">
                                     Mevcut Çalışan Sürüm: <span className="bg-slate-800 text-amber-500 px-2 py-0.5 rounded font-mono font-bold ml-1">{APP_VERSION}</span>
                                 </p>
                             </div>
                             <button 
                                 onClick={handleUpdateApp}
                                 disabled={isUpdating}
                                 className={`px-6 py-3 rounded-lg font-bold transition flex items-center justify-center gap-2 select-none shadow-lg active:scale-95 ${
                                     isUpdating 
                                         ? 'bg-slate-700 text-slate-400 cursor-not-allowed animate-pulse' 
                                         : 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-900/20'
                                 }`}
                             >
                                 {isUpdating ? 'Güncelleniyor...' : 'Sürümü Otomatik Güncelle'}
                             </button>
                         </div>
                         
                         {updateMessage && (
                             <div className="bg-slate-900 border border-slate-700 p-4 rounded-lg flex items-start gap-2">
                                 <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                                 <span className="text-sm text-slate-300 font-medium">{updateMessage}</span>
                             </div>
                         )}
                         
                         {updateLogs && (
                             <div className="space-y-2 mt-4">
                                 <div className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                                     <span>GÜNCELLEME LOGLARI</span>
                                     <span className={`text-[10px] px-2 py-0.5 rounded ${
                                         updateLogs.success ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                     }`}>
                                         {updateLogs.success ? 'KABUL EDİLDİ / BAŞARILI' : 'BAĞLANTI VEYA DERLEME HATASI'}
                                     </span>
                                 </div>
                                 <div className="bg-black/80 font-mono text-xs text-slate-300 p-4 rounded-lg border border-slate-800 overflow-x-auto max-h-60 custom-scrollbar space-y-1">
                                     {updateLogs.stdout && (
                                         <div>
                                             <span className="text-green-500 font-bold">[Komut Çıktısı]:</span>
                                             <pre className="whitespace-pre-wrap mt-1 opacity-70">{updateLogs.stdout}</pre>
                                         </div>
                                     )}
                                     {updateLogs.stderr && (
                                         <div className="mt-2 pt-2 border-t border-slate-900">
                                             <span className="text-cyan-500 font-bold">[Bildirimler / Günlükler]:</span>
                                             <pre className="whitespace-pre-wrap mt-1 text-red-400 opacity-90">{updateLogs.stderr}</pre>
                                         </div>
                                     )}
                                 </div>
                             </div>
                         )}
                     </div>
                 </div>

                 <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                     <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-white">
                         <Github className="text-white" /> Hakkında & GitHub
                     </h2>
                     <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex items-start gap-4">
                         <div className="p-3 bg-slate-800 rounded-full">
                             <Monitor size={24} className="text-slate-400" />
                         </div>
                         <div className="flex-1">
                             <h3 className="font-bold text-white text-lg">
                                 ProCertify Studio <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full ml-2">{APP_VERSION}</span>
                             </h3>
                             <p className="text-sm text-slate-400 mt-1 mb-4">
                                 Açık kaynak kodlu, profesyonel sertifika tasarım ve yönetim aracı. Projeyi GitHub üzerinde destekleyebilir hoặc katkıda bulunabilirsiniz.
                             </p>
                             <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-white bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition border border-slate-600">
                                 <Github size={16} /> GitHub Deposuna Git
                             </a>
                         </div>
                     </div>
                   </div>
             </div>
          </div>
        )}

        {/* VIEW: FILL & EXPORT */}
        {currentView === 'fill' && (
           <div className="flex-1 flex flex-col overflow-hidden relative">
              {/* Mobile Steps Navigator */}
              <div className="md:hidden flex bg-slate-950 border-b border-slate-800 shrink-0 select-none z-30">
                  <button onClick={() => setMobileFillStep(0)} className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition ${mobileFillStep === 0 ? 'border-amber-500 text-amber-500 bg-amber-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>1. Sertifikalar</button>
                  <button onClick={() => setMobileFillStep(1)} className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition ${mobileFillStep === 1 ? 'border-amber-500 text-amber-500 bg-amber-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>2. Veri</button>
                  <button onClick={() => setMobileFillStep(2)} className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider border-b-2 transition ${mobileFillStep === 2 ? 'border-amber-500 text-amber-500 bg-amber-500/5' : 'border-transparent text-slate-500 hover:text-slate-300'}`}>3. Önizle & İndir</button>
              </div>

              <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
              {/* Pillar 1: Project Selection (Collapsible) */}
              <div className={`${mobileFillStep === 0 ? 'flex flex-1 w-full md:flex-none' : 'hidden md:flex'} ${isFillSidebarOpen ? 'md:w-48' : 'md:w-0'} bg-slate-950 border-r border-slate-800 flex-col shrink-0 transition-all duration-300 overflow-hidden relative`}>
                  <div className="p-4 border-b border-slate-800 bg-slate-900/30 whitespace-nowrap flex justify-between items-center">
                    <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Sertifikalar</h2>
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-1 custom-scrollbar min-w-[192px]">
                     {projects.length === 0 ? (
                       <div className="text-[10px] text-slate-600 text-center py-4 italic">Proje bulunamadı.</div>
                     ) : (
                       projects.map(p => {
                          const isSelected = selectedFillProjectIds.includes(p.id);
                          return (
                              <div 
                                key={p.id} 
                                onClick={() => { if (isSelected) { if (selectedFillProjectIds.length > 1) setSelectedFillProjectIds(prev => prev.filter(id => id !== p.id)); } else { setSelectedFillProjectIds(prev => [...prev, p.id]); } }} 
                                className={`flex items-center gap-2 p-2.5 rounded-lg cursor-pointer border transition-all text-xs select-none ${isSelected ? 'bg-amber-500/10 border-amber-500/50 text-amber-200' : 'bg-transparent border-transparent text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'}`}
                              >
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-slate-700'}`}>
                                    {isSelected && <Check size={10} className="text-slate-900 font-bold" />}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                      <span className="truncate block">{p.name}</span>
                                      {isSelected && (
                                          <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                                              <div className="flex flex-col gap-1">
                                                  <label className="text-[9px] text-slate-500 uppercase font-bold">Ön Varyant</label>
                                                  <select 
                                                    value={projectFrontSelections[p.id] !== undefined ? projectFrontSelections[p.id] : (p.selectedFrontId || '')} 
                                                    onChange={(e) => setProjectFrontSelections(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-amber-400 outline-none focus:border-amber-500"
                                                  >
                                                      <option value="">Varsayılan Arkaplan</option>
                                                      {p.frontVariants && p.frontVariants.map(v => (
                                                          <option key={v.id} value={v.id}>{v.name}</option>
                                                      ))}
                                                  </select>
                                              </div>
                                              <div className="flex flex-col gap-1">
                                                  <label className="text-[9px] text-slate-500 uppercase font-bold">Arka Varyant</label>
                                                  <select 
                                                    value={projectBackSelections[p.id] !== undefined ? projectBackSelections[p.id] : (p.selectedBackId || '')} 
                                                    onChange={(e) => setProjectBackSelections(prev => ({ ...prev, [p.id]: e.target.value }))}
                                                    className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[10px] text-amber-400 outline-none focus:border-amber-500"
                                                  >
                                                      <option value="">Varsayılan Arkaplan</option>
                                                      {p.backVariants && p.backVariants.map(v => (
                                                          <option key={v.id} value={v.id}>{v.name}</option>
                                                      ))}
                                                  </select>
                                              </div>
                                          </div>
                                      )}
                                  </div>
                              </div>
                          )
                       })
                     )}
                  </div>
              </div>

              {/* Sidebar Toggle Button */}
              <button 
                onClick={() => setIsFillSidebarOpen(!isFillSidebarOpen)}
                className={`hidden md:block absolute top-1/2 -translate-y-1/2 z-50 p-1.5 bg-slate-800 border border-slate-700 text-slate-300 rounded-full shadow-xl hover:text-white transition-all ${isFillSidebarOpen ? 'left-[180px]' : 'left-2'}`}
              >
                {isFillSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
              </button>
              
              {/* Pillar 2: Data Entry */}
              <div className={`${mobileFillStep === 1 ? 'flex flex-1 w-full md:flex-none' : 'hidden md:flex'} md:w-[360px] bg-slate-800 border-r border-slate-700 flex-col z-20 overflow-hidden shadow-2xl shrink-0`}>
                 <div className="p-5 border-b border-slate-700 bg-slate-900 shrink-0 flex justify-between items-center">
                   <div>
                     <h2 className="text-lg font-bold text-white leading-tight">Veri Girişi</h2>
                     <p className="text-[10px] text-slate-400 mt-0.5">Seçili {selectedFillProjectIds.length} sertifikayı doldurun.</p>
                   </div>
                   <button onClick={() => setIsChatMode(!isChatMode)} className="text-[10px] text-amber-500 hover:text-amber-400 flex items-center gap-1.5 transition bg-amber-500/10 px-3 py-1.5 rounded-full border border-amber-500/20 font-bold uppercase tracking-tight">
                     {isChatMode ? <><List size={12}/> Form</> : <><MessageSquare size={12}/> Sohbet</>}
                   </button>
                 </div>

                 {isChatMode ? (
                   <div className="flex-1 flex flex-col overflow-hidden p-4">
                     {/* Chat Messages */}
                     <div ref={chatScrollRef} className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-2 pb-4">
                       {chatHistory.map(msg => (
                         <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                           <div className={`max-w-[90%] p-3 text-sm shadow-md ${msg.sender === 'user' ? 'bg-amber-600 text-white rounded-2xl rounded-tr-sm' : 'bg-slate-700 text-slate-200 rounded-2xl rounded-tl-sm'}`}>
                             {msg.sender === 'bot' && <Bot size={16} className="inline-block mr-2 mb-1 text-amber-400"/>}
                             <span dangerouslySetInnerHTML={{__html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')}} />
                           </div>
                         </div>
                       ))}
                     </div>

                     {/* Chat Input Area */}
                     {getUnifiedFillFields().length > 0 && currentChatStep < getUnifiedFillFields().length && (
                       <div className="mt-4 space-y-2 pt-2 border-t border-slate-700/50">
                         {/* Quick Replies */}
                         {(() => {
                            const field = getUnifiedFillFields()[currentChatStep];
                            let options: {label: string, value: string}[] = [];
                            if (field.type === ElementType.DROPDOWN || field.type === ElementType.CHOICE_BOX) {
                              options = (field.options || []).map(o => ({label: o, value: o}));
                            } else if (field.type === ElementType.COMPANY) {
                              options = companies.map(c => ({label: c.name, value: c.name}));
                            } else if (field.type === ElementType.SIGNATURE) {
                              options = signatures.filter(sig => !field.allowedSignatureIds || field.allowedSignatureIds.length === 0 || field.allowedSignatureIds.includes(sig.id)).map(sig => ({label: sig.name, value: sig.url}));
                            }

                            if (options.length > 0) {
                              const isSearchEmpty = chatInputValue.trim() === '';
                              const filteredOptions = isSearchEmpty ? options : options.filter(opt => turkishToLower(opt.label).includes(turkishToLower(chatInputValue)));
                              
                              const shouldShowOptions = options.length <= 4 || !isSearchEmpty || field.type === ElementType.COMPANY;
                              
                              const displayMax = field.type === ElementType.COMPANY ? 6 : 999;
                              const displayedOptions = filteredOptions.slice(0, displayMax);

                              if (!shouldShowOptions) return null;

                              return (
                                <div className="mb-2 space-y-2">
                                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                                    {displayedOptions.length > 0 ? displayedOptions.map((opt, i) => (
                                      <button key={i} onClick={() => handleChatSubmit(opt.value, opt.label)} className="bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 hover:text-white px-3 py-1.5 rounded-full transition border border-slate-600 shadow-sm">
                                        {opt.label}
                                      </button>
                                    )) : (
                                      <span className="text-xs text-slate-500">Sonuç bulunamadı.</span>
                                    )}
                                    {filteredOptions.length > displayMax && (
                                        <span className="text-[10px] text-slate-500 flex items-center px-2 italic">+{filteredOptions.length - displayMax} daha var (Yazarak arayın)</span>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                         })()}

                         <div className="flex items-center gap-2">
                           {currentChatStep > 0 && (
                             <button 
                               onClick={handleChatUndo} 
                               className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full transition border border-slate-600 flex items-center justify-center shrink-0 shadow-sm" 
                               title="Önceki Adıma Dön"
                             >
                               <ChevronLeft size={16} />
                             </button>
                           )}
                           <div className="relative flex-1 flex items-center">
                             <input
                               type="text"
                               value={chatInputValue}
                               onChange={(e) => setChatInputValue(e.target.value)}
                               onKeyDown={(e) => { if (e.key === 'Enter') handleChatSubmit(chatInputValue); }}
                               onFocus={() => {
                                 setTimeout(() => {
                                   if (chatScrollRef.current) {
                                     chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
                                   }
                                   window.scrollTo(0, document.body.scrollHeight);
                                 }, 300);
                               }}
                               placeholder={`${getUnifiedFillFields()[currentChatStep]?.displayLabel} girin...`}
                               className="w-full bg-slate-900 border border-slate-600 rounded-full pl-4 pr-20 py-3 focus:border-amber-500 outline-none text-white placeholder-slate-500 transition text-sm shadow-inner"
                             />
                             <div className="absolute right-2 flex items-center gap-1">
                               <div className="relative flex items-center justify-center w-8 h-8 group" title="Tarih Seç">
                                 <button onClick={() => { setIsCalendarOpen(!isCalendarOpen); if (!isCalendarOpen) setCalendarDate(new Date()); }} className="p-1 rounded-full hover:bg-slate-700 transition">
                                   <Calendar size={18} className={`transition ${isCalendarOpen ? 'text-amber-500' : 'text-slate-400 group-hover:text-amber-500'}`} />
                                 </button>
                                 
                                 {isCalendarOpen && (
                                   <div className="absolute bottom-full right-0 mb-2 w-48 bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
                                     <div className="flex justify-between items-center mb-2 gap-1">
                                       <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors"><ChevronLeft size={14}/></button>
                                       <div className="flex items-center gap-1 overflow-hidden">
                                          <select 
                                            value={calendarDate.getMonth()} 
                                            onChange={(e) => setCalendarDate(new Date(calendarDate.getFullYear(), parseInt(e.target.value), 1))}
                                            className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[9px] font-bold text-white w-14 outline-none focus:border-amber-500 transition-colors cursor-pointer appearance-none text-center"
                                          >
                                            {Array.from({ length: 12 }, (_, i) => (
                                              <option key={i} value={i} className="bg-slate-800 text-white">
                                                {new Date(2000, i, 1).toLocaleDateString('tr-TR', { month: 'short' }).toUpperCase()}
                                              </option>
                                            ))}
                                          </select>
                                          <select 
                                            value={calendarDate.getFullYear()} 
                                            onChange={(e) => setCalendarDate(new Date(parseInt(e.target.value), calendarDate.getMonth(), 1))}
                                            className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-[9px] font-bold text-amber-500 w-14 outline-none focus:border-amber-500 transition-colors cursor-pointer appearance-none text-center"
                                          >
                                            {Array.from({ length: 141 }, (_, i) => 1920 + i).map(y => (
                                              <option key={y} value={y} className="bg-slate-800 text-white">{y}</option>
                                            ))}
                                            {calendarDate.getFullYear() < 1920 && <option value={calendarDate.getFullYear()}>{calendarDate.getFullYear()}</option>}
                                            {calendarDate.getFullYear() > 2060 && <option value={calendarDate.getFullYear()}>{calendarDate.getFullYear()}</option>}
                                          </select>
                                       </div>
                                       <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors"><ChevronRight size={14}/></button>
                                     </div>
                                     <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                                       {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => <div key={d} className="text-[8px] text-slate-500 font-bold uppercase">{d}</div>)}
                                     </div>
                                     <div className="grid grid-cols-7 gap-0.5">
                                       {(() => {
                                         const year = calendarDate.getFullYear();
                                         const month = calendarDate.getMonth();
                                         const firstDay = new Date(year, month, 1).getDay();
                                         const daysInMonth = new Date(year, month + 1, 0).getDate();
                                         const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday first
                                         
                                         const days = [];
                                         for (let i = 0; i < offset; i++) days.push(<div key={`empty-${i}`} />);
                                         
                                         const selectedDates = getSelectedDatesFromText(chatInputValue);
                                         
                                         for (let i = 1; i <= daysInMonth; i++) {
                                           const dateString = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                                           const isSelected = selectedDates.includes(dateString);
                                           days.push(
                                             <button 
                                               key={i} 
                                               onClick={() => toggleDateSelection(dateString)}
                                               className={`w-6 h-6 rounded-md text-[10px] flex items-center justify-center transition ${isSelected ? 'bg-amber-500 text-white font-bold shadow-md shadow-amber-900/50' : 'text-slate-400 hover:bg-slate-700 hover:text-white'}`}
                                             >
                                               {i}
                                             </button>
                                           );
                                         }
                                         return days;
                                       })()}
                                     </div>
                                   </div>
                                 )}
                               </div>
                               <button onClick={() => { handleChatSubmit(chatInputValue); setIsCalendarOpen(false); }} className="p-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full transition shadow-md">
                                 <Send size={16} />
                               </button>
                             </div>
                           </div>
                           <button onClick={() => { handleChatSubmit('', undefined, true); setIsCalendarOpen(false); }} className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-full text-sm font-medium transition border border-slate-600 whitespace-nowrap" title="Cevapsız Bırak">
                             Geç
                           </button>
                         </div>
                       </div>
                     )}
                     
                     {/* Restart Button */}
                     {getUnifiedFillFields().length > 0 && currentChatStep >= getUnifiedFillFields().length && (
                        <div className="flex flex-col gap-2 w-full mt-4">
                           <button onClick={handleChatUndo} className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm transition flex items-center justify-center gap-2 border border-slate-700">
                             <ChevronLeft size={16} /> Son Adıma Geri Dön
                           </button>
                           <button onClick={() => {
                             setCurrentChatStep(0);
                             setChatHistory([{ id: Date.now().toString(), sender: 'bot', text: `Baştan başlıyoruz. Lütfen **${getUnifiedFillFields()[0].displayLabel}** giriniz.` }]);
                           }} className="w-full py-2.5 bg-amber-600/20 hover:bg-amber-600/30 text-amber-500 rounded-xl text-sm transition flex items-center justify-center gap-2 border border-amber-500/20">
                             <RotateCcw size={16} /> Formu Sıfırla
                           </button>
                        </div>
                     )}
                   </div>
                 ) : (
                   <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6 custom-scrollbar">
                      {getUnifiedFillFields().length === 0 ? (
                        <div className="text-slate-500 text-center py-10 select-none">
                          Seçili projelerde doldurulacak ortak alan bulunamadı veya seçim yapmadınız.
                        </div>
                      ) : (
                          <>
                          {getUnifiedFillFields().filter(f => f.type !== ElementType.CHOICE_BOX).map((field, idx) => (
                         <div key={idx} className="space-y-2">
                            <label className="text-sm font-medium text-amber-500 flex justify-between select-none">
                              <span className="truncate pr-2">{field.displayLabel}</span>
                              <span className="text-slate-500 text-[10px] bg-slate-900 px-2 rounded uppercase shrink-0">{field.type === ElementType.DROPDOWN ? 'SEÇENEK' : (field.type === ElementType.COMPANY ? 'FİRMA' : (field.type === ElementType.TCKN ? 'TC NO' : (field.type === ElementType.QRCODE ? 'QR VERİSİ' : field.type)))}</span>
                            </label>
                            {(field.type === ElementType.TEXT || field.type === ElementType.QRCODE || field.type === ElementType.TCKN) && (
                              <textarea rows={field.label.toLowerCase().includes('adres') ? 3 : 1} value={fillValues[field.label] || ''} onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-amber-500 outline-none text-white placeholder-slate-600 transition resize-y min-h-[46px]" placeholder={field.type === ElementType.QRCODE ? "https://site.com" : (field.type === ElementType.TCKN ? "TC Kimlik No Girin (11 Hane)" : "Metin değeri girin")} style={{ overflow: 'hidden' }} maxLength={field.type === ElementType.TCKN ? 11 : undefined} onInput={(e) => { const target = e.target as HTMLTextAreaElement; target.style.height = 'auto'; target.style.height = target.scrollHeight + 'px'; }} />
                            )}
                            {field.type === ElementType.DROPDOWN && (<div className="relative"><select value={fillValues[field.label] || ''} onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-amber-500 outline-none text-white appearance-none cursor-pointer hover:bg-slate-800 transition"><option value="">Bir seçenek belirleyin...</option>{field.options && field.options.map((opt, i) => (<option key={i} value={opt}>{opt}</option>))}</select><div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div></div>)}
                            {field.type === ElementType.COMPANY && (() => {
                               const currentVal = fillValues[field.label] || '';
                               const filtered = currentVal ? companies.filter(c => turkishToLower(c.name).includes(turkishToLower(currentVal)) || (c.shortName && turkishToLower(c.shortName).includes(turkishToLower(currentVal)))) : companies;
                               return (
                                 <div className="relative">
                                   <input 
                                     list={`companies-list-${idx}`} 
                                     value={currentVal} 
                                     onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))} 
                                     className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-green-500 outline-none text-white transition placeholder-slate-600" 
                                     placeholder="Yazarak arayın veya seçin..." 
                                   />
                                   <datalist id={`companies-list-${idx}`}>
                                     {filtered.map((company, i) => (
                                       <option key={i} value={company.name}>{company.name}</option>
                                     ))}
                                   </datalist>
                                   {companies.length === 0 && (
                                     <div className="text-[10px] text-red-400 mt-1">Firma listesi boş. Ayarlar sekmesinden ekleyebilirsiniz.</div>
                                   )}
                                 </div>
                               );
                             })()}
                            {field.type === ElementType.SIGNATURE && (<div className="relative"><select value={fillValues[field.label] || ''} onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-amber-500 outline-none text-white appearance-none cursor-pointer hover:bg-slate-800 transition"><option value="">İmza Seçiniz...</option>{signatures.filter(sig => !field.allowedSignatureIds || field.allowedSignatureIds.length === 0 || field.allowedSignatureIds.includes(sig.id)).map(sig => (<option key={sig.id} value={sig.url}>{sig.name}</option>))}</select><div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>{field.allowedSignatureIds && field.allowedSignatureIds.length > 0 && (<div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><Filter size={10} /> Bu alan için {field.allowedSignatureIds.length} adet imza tanımlı.</div>)}</div>)}
                         </div>
                        ))}
                        {getUnifiedFillFields().some(f => f.type === ElementType.CHOICE_BOX) && (
                            <div className="border-t border-slate-700 pt-4 mt-4">
                                <button onClick={() => setShowChoiceFields(!showChoiceFields)} className="flex items-center justify-between w-full p-3 bg-slate-800 hover:bg-slate-700 rounded-lg transition text-sm text-slate-300 font-medium"><div className="flex items-center gap-2"><SlidersHorizontal size={16} /><span>Seçim Kutuları / Onaylar</span><span className="bg-slate-600 text-white text-[10px] px-1.5 rounded-full">{getUnifiedFillFields().filter(f => f.type === ElementType.CHOICE_BOX).length}</span></div>{showChoiceFields ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button>
                                {showChoiceFields && (<div className="mt-3 space-y-4 pl-2 border-l-2 border-slate-700 animate-in fade-in slide-in-from-top-2">{getUnifiedFillFields().filter(f => f.type === ElementType.CHOICE_BOX).map((field, idx) => (<div key={`choice-${idx}`} className="space-y-2"><label className="text-xs font-medium text-slate-400 flex justify-between select-none"><span>{field.displayLabel}</span></label><div className="flex flex-col gap-2 bg-slate-900 p-2 rounded border border-slate-700">{field.options && field.options.map((opt, i) => { const currentVal = fillValues[field.label] || field.defaultValue || field.options?.[0]; const isChecked = currentVal === opt; return (<label key={i} className="flex items-center gap-3 cursor-pointer group p-1 rounded hover:bg-slate-800 transition"><input type="radio" name={field.label} value={opt} checked={isChecked} onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))} className="hidden" /><div className={`w-4 h-4 rounded-full border flex items-center justify-center transition ${isChecked ? 'border-amber-500' : 'border-slate-500 group-hover:border-slate-400'}`}>{isChecked && <div className="w-2 h-2 bg-amber-500 rounded-full" />}</div><span className={`text-xs ${isChecked ? 'text-white' : 'text-slate-500'}`}>{opt}</span></label>)})}</div></div>))}</div>)}
                                {!showChoiceFields && (<p className="text-[10px] text-slate-500 mt-2 text-center">Varsayılan seçenekler (Örn: Evet) kullanılacak. Değiştirmek için tıklayın.</p>)}
                            </div>
                        )}
                        </>
                      )}
                   </div>
                 )}

                 <div className="hidden md:block">
                    <div className="p-6 border-t border-slate-700 bg-slate-900 shrink-0 select-none space-y-4">
                       {/* EXPORT MODE TOGGLE */}
                       {selectedFillProjectIds.length > 1 && (
                           <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                               <button 
                                   onClick={() => setExportMode('single')} 
                                   className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition ${exportMode === 'single' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                               >
                                   <FileStack size={14} /> Tek Dosya (Birleştir)
                               </button>
                               <button 
                                   onClick={() => setExportMode('separate')} 
                                   className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition ${exportMode === 'separate' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                               >
                                   <Files size={14} /> Ayrı Dosyalar (Klasör)
                               </button>
                           </div>
                       )}

                       <button 
                         onClick={exportPDF}
                         disabled={isGenerating}
                         className={`w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 transition active:scale-95 transform ${isGenerating ? 'opacity-70 cursor-wait' : ''}`}
                       >
                         {isGenerating ? (
                             <div className="flex items-center gap-2">
                                <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                                {progress > 0 && <span className="text-xs">{progress}%</span>}
                             </div>
                         ) : (
                             <Download size={22} />
                         )}
                         {isGenerating ? 'Kaydediliyor...' : `PDF OLUŞTUR (${selectedFillProjectIds.length})`}
                       </button>
                       {exportMode === 'separate' && selectedFillProjectIds.length > 1 && (
                           <p className="text-[10px] text-slate-500 text-center">Seçilen klasöre tüm sertifikalar ayrı ayrı kaydedilecektir.</p>
                       )}
                    </div>
                 </div>
              </div>

              {/* LIST PREVIEW MODE */}
              <div className={`${mobileFillStep === 2 ? 'flex w-full' : 'hidden md:flex'} flex-1 bg-[#0b0f19] overflow-auto p-4 md:p-10 flex-col items-center gap-6 md:gap-10 custom-scrollbar relative pb-32`}>
                <div className="md:hidden w-full max-w-md mx-auto mb-4 relative z-20">
                     <div className="p-4 border border-slate-700 bg-slate-900 rounded-xl select-none space-y-4 shadow-xl">
                       {selectedFillProjectIds.length > 1 && (
                           <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                               <button onClick={() => setExportMode('single')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-[10px] font-medium transition ${exportMode === 'single' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><FileStack size={14} /> Tek Dosya</button>
                               <button onClick={() => setExportMode('separate')} className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-[10px] font-medium transition ${exportMode === 'separate' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}><Files size={14} /> Ayrı Dosyalar</button>
                           </div>
                       )}
                       <button onClick={exportPDF} disabled={isGenerating || selectedFillProjectIds.length === 0} className={`w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 transition active:scale-95 transform ${isGenerating ? 'opacity-70 cursor-wait' : ''} ${selectedFillProjectIds.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         {isGenerating ? (<div className="flex items-center gap-2"><div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />{progress > 0 && <span className="text-xs">{progress}%</span>}</div>) : (<Download size={22} />)}
                         {isGenerating ? 'Kaydediliyor...' : `PDF İNDİR (${selectedFillProjectIds.length})`}
                       </button>
                    </div>
                </div>

                {selectedFillProjectIds.length > 0 && (
                    <div className="text-slate-500 text-sm mb-4 select-none whitespace-nowrap">
                        Önizleme ({selectedFillProjectIds.length} Proje). Arka yüzü olan kartları çevirmek için üzerine tıklayın.
                    </div>
                )}
                <div className="flex flex-col items-center gap-10 min-w-max">
                  {projects.filter(p => selectedFillProjectIds.includes(p.id)).map(p => {
                    const side = previewSides[p.id] || 'front';
                    const activeBack = getActiveSideData(p, 'back', true);
                    const hasBack = activeBack && (activeBack.bgUrl || activeBack.elements.length > 0);
                    const previewWidth = 700; 
                    const calcScale = previewWidth / p.width;
                    const activeSideData = getActiveSideData(p, side, true);
                    return (
                        <div key={p.id} onClick={() => { if (hasBack) { togglePreviewSide(p.id); } }} className={`relative group transition-all duration-300 ${hasBack ? 'cursor-pointer' : 'cursor-default'}`}>
                            <div className="absolute -top-3 left-4 z-10 flex gap-2 select-none"><span className="bg-slate-800 text-white text-xs px-3 py-1 rounded-full border border-slate-700 shadow-lg font-bold">{p.name}</span><span className={`text-xs px-2 py-1 rounded-full border shadow-lg font-bold flex items-center gap-1 ${side === 'front' ? 'bg-blue-900/80 text-blue-200 border-blue-700' : 'bg-purple-900/80 text-purple-200 border-purple-700'}`}>{side === 'front' ? 'ÖN YÜZ' : 'ARKA YÜZ'}</span>{hasBack && (<span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-1 rounded-full border border-slate-600 flex items-center gap-1 group-hover:bg-amber-600 group-hover:text-white transition-colors"><RotateCcw size={10} /> Çevir</span>)}</div>
                            <div className={`rounded-lg overflow-hidden border-4 shadow-2xl transition-colors ${activeProjectId === p.id ? 'border-amber-500/50' : 'border-slate-800'} ${hasBack ? 'hover:border-slate-600' : ''}`}><CanvasEditor elements={getPreviewElements(p, side)} width={p.width} height={p.height} bgUrl={activeSideData?.bgUrl || ''} selectedId={null} onSelect={() => {}} onUpdateElement={() => {}} onDeleteElement={() => {}} scale={calcScale} readOnly={true} /></div>
                        </div>
                    );
                })}
                </div>
                {selectedFillProjectIds.length === 0 && (<div className="flex flex-col items-center justify-center h-full text-slate-500 select-none"><LayoutTemplate size={48} className="mb-4 opacity-20" /><p>Önizleme için soldan proje seçiniz.</p></div>)}
              </div>
            </div>
           </div>
        )}
      </div>
      {showSignaturePad && (<SignaturePad onSave={handleSignatureDrawSave} onClose={() => setShowSignaturePad(false)} />)}
    </div>
  );
};

const ProtectedApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const session = localStorage.getItem('vps_session');
    const token = localStorage.getItem('vps_session_token');
    if (session === 'authenticated' && token) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(getApiUrl('/api/login'), {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (res.ok && data.success && data.token) {
        localStorage.setItem('vps_session', 'authenticated');
        localStorage.setItem('vps_session_token', data.token);
        setIsAuthenticated(true);
      } else {
        setError(data.error || 'Hatalı şifre. Lütfen tekrar deneyin.');
      }
    } catch (error) {
      setError('Sunucu ile iletişim kurulamadı.');
    }
  };

  if (isAuthenticated) {
    return <App />;
  }

  return (
    <div className="flex h-[100dvh] bg-slate-950 items-center justify-center font-sans text-slate-200 selection:bg-amber-500/30">
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl w-full max-w-sm flex flex-col items-center">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-amber-700 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-900/40 mb-6">
           <FileText className="text-white" size={32} />
        </div>
        <h1 className="text-2xl font-bold text-white mb-2 text-center">ProCertify <span className="text-amber-500">Studio</span></h1>
        <p className="text-slate-500 text-sm mb-6 text-center">Devam etmek için yönetici şifrenizi girin.</p>

        <form onSubmit={handleLogin} className="w-full space-y-4">
          <div>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifre"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition shadow-inner"
              autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-xs text-center">{error}</p>}
          <button 
            type="submit" 
            className="w-full bg-amber-600 hover:bg-amber-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-amber-900/20 transition active:scale-95"
          >
            Giriş Yap
          </button>
        </form>
        <div className="mt-8 text-[10px] text-slate-600 font-mono text-center">
          <p>Güvenli Erişim Sistemi</p>
        </div>
      </div>
    </div>
  );
};

export default ProtectedApp;