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
  Copy // Added Copy Icon
} from 'lucide-react';
import { jsPDF } from "jspdf";
import QRCode from 'qrcode';
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
import SignaturePad from './components/SignaturePad'; // Ensure this component exists in components folder

type ViewMode = 'template' | 'settings' | 'fill' | 'projects';
type Side = 'front' | 'back';

const DEFAULT_WIDTH = 2000;
const DEFAULT_HEIGHT = 1414;
const APP_VERSION = "v1.2.4";
const GITHUB_URL = "https://github.com/yourusername/procertify-studio"; // Placeholder

const createNewProject = (name: string): CertificateProject => ({
  id: Date.now().toString(),
  name: name,
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  createdAt: Date.now(),
  filenamePattern: 'Sertifika-{Ad Soyad}', // Default pattern
  front: {
    bgUrl: TEMPLATES[0].bgUrl,
    elements: [
       { id: '1', type: ElementType.TEXT, content: '{AD SOYAD}', x: 800, y: 600, width: 400, height: 100, fontSize: 80, fontFamily: FontStyle.SERIF, color: '#000000', fontWeight: 700, fontStyle: 'normal', textAlign: 'center', label: 'Ad Soyad' },
    ]
  },
  back: {
    bgUrl: '', // Empty by default
    elements: []
  }
});

const App = () => {
  // --- Global State ---
  const [projects, setProjects] = useState<CertificateProject[]>(() => {
    try {
      const saved = localStorage.getItem('procertify_projects');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return [createNewProject('Yeni Sertifika Projesi')];
  });

  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
     const saved = localStorage.getItem('procertify_projects');
     if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed[0].id;
     }
     return '';
  });

  // State for Fill Mode: Multiple selected projects
  const [selectedFillProjectIds, setSelectedFillProjectIds] = useState<string[]>([]);
  // State for Fill Mode: Individual project flip state (front/back)
  const [previewSides, setPreviewSides] = useState<Record<string, Side>>({});

  // Initialize selectedFillProjectIds with activeProjectId on mount
  useEffect(() => {
    if (activeProjectId && selectedFillProjectIds.length === 0) {
        setSelectedFillProjectIds([activeProjectId]);
    }
  }, [activeProjectId]);

  const activeProject = projects.find(p => p.id === activeProjectId) || projects[0];

  // UI State
  const [activeSide, setActiveSide] = useState<Side>('front');
  const [currentView, setCurrentView] = useState<ViewMode>('template');
  const [showSigPermissions, setShowSigPermissions] = useState(false); // Toggle for signature permission modal
  const [showOptionManager, setShowOptionManager] = useState(false); // Toggle for dropdown options modal
  const [showSignaturePad, setShowSignaturePad] = useState(false); // Toggle for drawing pad
  const [tempOptionInput, setTempOptionInput] = useState(''); // For adding new option
  const [isEditingName, setIsEditingName] = useState(false); // For inline project renaming
  
  // Signatures State
  const [signatures, setSignatures] = useState<SavedSignature[]>(() => {
    try {
      const saved = localStorage.getItem('procertify_signatures');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // Company List State (Now structured objects)
  const [companies, setCompanies] = useState<Company[]>(() => {
    try {
        const saved = localStorage.getItem('procertify_companies');
        if (saved) {
            const parsed = JSON.parse(saved);
            // MIGRATION: Check if it's the old string array format
            if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
                return parsed.map((name: string) => ({
                    id: Date.now() + Math.random().toString(),
                    name: name,
                    shortName: name // Default short name to full name
                }));
            }
            return parsed;
        }
    } catch(e) {}
    return [];
  });
  const [tempCompanyInput, setTempCompanyInput] = useState('');

  // --- Editor State ---
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.4);
  
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);

  // --- Fill State ---
  // Store values by LABEL instead of ID to share across projects
  // Format: { "Ad Soyad": "John Doe", "İmza Alanı 1": "url..." }
  const [fillValues, setFillValues] = useState<Record<string, string>>({});

  // --- Persistence Effects ---
  useEffect(() => {
    localStorage.setItem('procertify_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('procertify_signatures', JSON.stringify(signatures));
  }, [signatures]);

  useEffect(() => {
    localStorage.setItem('procertify_companies', JSON.stringify(companies));
  }, [companies]);

  useEffect(() => {
     if (!projects.find(p => p.id === activeProjectId) && projects.length > 0) {
        setActiveProjectId(projects[0].id);
     }
  }, [projects, activeProjectId]);

  // Focus rename input when editing starts
  useEffect(() => {
    if (isEditingName && projectNameInputRef.current) {
        projectNameInputRef.current.focus();
    }
  }, [isEditingName]);

  // Auto-resize for Template Editor ONLY
  useEffect(() => {
    if (currentView !== 'template') return;

    const handleResize = () => {
      if (editorContainerRef.current) {
        const { clientWidth, clientHeight } = editorContainerRef.current;
        const padding = 80;
        const scaleX = (clientWidth - padding) / activeProject.width;
        const scaleY = (clientHeight - padding) / activeProject.height;
        setScale(Math.min(scaleX, scaleY));
      }
    };
    setTimeout(handleResize, 100);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeProject, currentView]);


  // --- Helper Functions ---
  const updateProjectSide = (side: Side, updates: Partial<CertificateSide>) => {
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          [side]: { ...p[side], ...updates }
        };
      }
      return p;
    }));
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

      // Swap width and height
      updateProjectMeta({
          width: activeProject.height,
          height: activeProject.width
      });
  };

  // Helper to toggle side in Preview Mode
  const togglePreviewSide = (projectId: string) => {
      setPreviewSides(prev => ({
          ...prev,
          [projectId]: prev[projectId] === 'back' ? 'front' : 'back'
      }));
  };

  // Helper to get available labels for the current project for filename config
  const getProjectLabels = () => {
    const labels = new Set<string>();
    [activeProject.front, activeProject.back].forEach(side => {
        side.elements.forEach(el => {
            if (el.label) {
                if (el.type === ElementType.TEXT || el.type === ElementType.DROPDOWN || el.type === ElementType.SIGNATURE) {
                    labels.add(el.label);
                }
                // If it is a company, add both the label and the short label suffix
                if (el.type === ElementType.COMPANY) {
                    labels.add(el.label);
                    labels.add(`${el.label}_Kisa`);
                }
            }
        });
    });
    return Array.from(labels);
  };

  // --- Actions ---
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

      // Deep clone using JSON parse/stringify to avoid reference issues
      const newProject: CertificateProject = {
          ...JSON.parse(JSON.stringify(projectToClone)),
          id: Date.now().toString(),
          name: `${projectToClone.name} (Kopya)`,
          createdAt: Date.now()
      };

      setProjects(prev => [...prev, newProject]);
      // Optional: Switch to the new project immediately
      // setActiveProjectId(newProject.id);
      // setCurrentView('template');
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
      // If we deleted the active project, logic in useEffect will switch to the first available one
    }
  };

  const handleTemplateUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        if (evt.target?.result) {
            updateProjectSide(activeSide, { bgUrl: evt.target.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addElement = (type: ElementType) => {
    if (type === ElementType.IMAGE) {
      logoInputRef.current?.click();
      return;
    }
    const content = type === ElementType.TEXT ? '{METİN}' 
                    : (type === ElementType.DROPDOWN ? '{SEÇENEK}' 
                    : (type === ElementType.COMPANY ? '{FİRMA}' 
                    : (type === ElementType.QRCODE ? '{Ad Soyad}' : '')));
    
    const width = (type === ElementType.SIGNATURE || type === ElementType.QRCODE) ? 200 : 400;
    const height = (type === ElementType.SIGNATURE) ? 100 : (type === ElementType.QRCODE ? 200 : 100);
    
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
      label: type === ElementType.TEXT ? 'Metin Alanı' 
              : (type === ElementType.SIGNATURE ? 'İmza Alanı' 
              : (type === ElementType.DROPDOWN ? 'Seçenekli Alan' 
              : (type === ElementType.COMPANY ? 'Firma Alanı'
              : (type === ElementType.QRCODE ? 'QR Kod' : 'Görsel')))),
      options: type === ElementType.DROPDOWN ? [] : undefined,
      fontWeight: 400,
      fontStyle: 'normal',
      textAlign: 'center' // Default alignment
    };

    const currentElements = activeProject[activeSide].elements;
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
             const currentElements = activeProject[activeSide].elements;
             updateProjectElements(activeSide, [...currentElements, newEl]);
           };
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const updateElement = (id: string, updates: Partial<CanvasElement>) => {
    const currentElements = activeProject[activeSide].elements;
    const newElements = currentElements.map(el => el.id === id ? { ...el, ...updates } : el);
    updateProjectElements(activeSide, newElements);
  };

  const deleteElement = (id: string) => {
    const currentElements = activeProject[activeSide].elements;
    updateProjectElements(activeSide, currentElements.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // --- Keyboard Movement Effect ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only active in template view and when an element is selected
      if (!selectedId || currentView !== 'template') return;

      // Ignore if user is typing in an input field
      const activeEl = document.activeElement as HTMLElement;
      if (activeEl && (
          activeEl.tagName === 'INPUT' || 
          activeEl.tagName === 'TEXTAREA' || 
          activeEl.tagName === 'SELECT'
      )) {
          return;
      }

      const step = e.shiftKey ? 10 : 1; // Shift + Arrow = 10px, Arrow = 1px

      let dx = 0;
      let dy = 0;

      if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else return; // Ignore other keys

      e.preventDefault(); // Prevent page scrolling

      const currentElement = activeProject[activeSide].elements.find(el => el.id === selectedId);
      
      if (currentElement) {
          updateElement(selectedId, {
              x: currentElement.x + dx,
              y: currentElement.y + dy
          });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedId, activeProjectId, activeSide, projects, currentView]); 


  const toggleAllowedSignature = (elementId: string, sigId: string) => {
      const element = activeProject[activeSide].elements.find(el => el.id === elementId);
      if (!element) return;

      const currentAllowed = element.allowedSignatureIds || [];
      let newAllowed;
      if (currentAllowed.includes(sigId)) {
          newAllowed = currentAllowed.filter(id => id !== sigId);
      } else {
          newAllowed = [...currentAllowed, sigId];
      }
      updateElement(elementId, { allowedSignatureIds: newAllowed });
  };

  // --- Option Management (Dropdown) ---
  const addOption = (elementId: string) => {
      if (!tempOptionInput.trim()) return;
      const element = activeProject[activeSide].elements.find(el => el.id === elementId);
      if (!element) return;
      
      const currentOptions = element.options || [];
      updateElement(elementId, { options: [...currentOptions, tempOptionInput.trim()] });
      setTempOptionInput('');
  };

  const removeOption = (elementId: string, index: number) => {
      const element = activeProject[activeSide].elements.find(el => el.id === elementId);
      if (!element || !element.options) return;
      
      const newOptions = element.options.filter((_, i) => i !== index);
      updateElement(elementId, { options: newOptions });
  };

  // --- Company Settings Management ---
  const addCompany = (input: string) => {
      if (!input.trim()) return;
      
      // Split by newline to get potential list
      const lines = input.split('\n').map(n => n.trim()).filter(n => n.length > 0);
      
      const newCompanies: Company[] = [];
      
      lines.forEach(line => {
          // Check for separator "|" for short name
          let name = line;
          let short = line;
          
          if (line.includes('|')) {
              const parts = line.split('|');
              name = parts[0].trim();
              short = parts[1].trim() || name;
          }
          
          newCompanies.push({
              id: Date.now().toString() + Math.random(),
              name: name,
              shortName: short
          });
      });

      setCompanies(prev => {
          // Simple duplication check based on name
          const existingNames = new Set(prev.map(p => p.name));
          const uniqueNew = newCompanies.filter(c => !existingNames.has(c.name));
          return [...prev, ...uniqueNew]; 
      });
      setTempCompanyInput('');
  };

  const removeCompany = (id: string) => {
      setCompanies(prev => prev.filter(c => c.id !== id));
  };


  // --- Signature Settings ---
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

  // --- Backup & Restore ---
  const handleExportBackup = () => {
    const backupData = {
      version: '1.2.4',
      timestamp: Date.now(),
      projects,
      signatures,
      companies, // Added companies to backup
      activeProjectId
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `procertify_yedek_${new Date().toLocaleDateString('tr-TR').replace(/\./g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const json = JSON.parse(event.target?.result as string);
            
            // Basic validation
            if (json.projects && Array.isArray(json.projects)) {
                if(confirm(`Yedek dosyasında ${json.projects.length} proje ve ${json.signatures?.length || 0} imza bulundu.\n\nDİKKAT: Bu işlem mevcut tüm verilerinizi SİLECEK ve yedekteki verileri yükleyecektir.\n\nDevam etmek istiyor musunuz?`)) {
                    setProjects(json.projects);
                    if (json.signatures) setSignatures(json.signatures);
                    if (json.companies) setCompanies(json.companies);
                    // Ensure active project ID exists in new data, otherwise pick first
                    if (json.activeProjectId && json.projects.some((p: any) => p.id === json.activeProjectId)) {
                       setActiveProjectId(json.activeProjectId);
                    } else if (json.projects.length > 0) {
                       setActiveProjectId(json.projects[0].id);
                    }
                    alert("Yedek başarıyla yüklendi! Sisteminiz güncellendi.");
                }
            } else {
                alert("Hata: Geçersiz yedek dosyası formatı.");
            }
        } catch (err) {
            alert("Dosya okunamadı veya bozuk: " + err);
        }
    };
    reader.readAsText(file);
    // Reset input so same file can be selected again if needed
    if (backupInputRef.current) backupInputRef.current.value = '';
  };


  // --- Unified Fill Logic ---
  const getUnifiedFillFields = () => {
    const fields: Record<string, { 
        type: ElementType, 
        label: string, 
        allowedSignatureIds?: string[],
        options?: string[]
    }> = {};

    const targetProjects = projects.filter(p => selectedFillProjectIds.includes(p.id));

    targetProjects.forEach(proj => {
        [proj.front, proj.back].forEach(side => {
            side.elements.forEach(el => {
                // Included COMPANY here
                if (el.type === ElementType.TEXT || el.type === ElementType.SIGNATURE || el.type === ElementType.DROPDOWN || el.type === ElementType.COMPANY) {
                    const key = el.label || el.id;
                    if (!fields[key]) {
                        fields[key] = {
                            type: el.type,
                            label: key,
                            allowedSignatureIds: el.allowedSignatureIds,
                            options: el.options
                        };
                    } else {
                        if (fields[key].type === el.type) {
                           // Merge logic...
                           const existingAllowed = fields[key].allowedSignatureIds || [];
                           const newAllowed = el.allowedSignatureIds || [];
                           const mergedSigs = Array.from(new Set([...existingAllowed, ...newAllowed]));
                           if (mergedSigs.length > 0) fields[key].allowedSignatureIds = mergedSigs;

                           const existingOptions = fields[key].options || [];
                           const newOptions = el.options || [];
                           const mergedOptions = Array.from(new Set([...existingOptions, ...newOptions]));
                           if (mergedOptions.length > 0) fields[key].options = mergedOptions;
                        }
                    }
                }
            });
        });
    });

    return Object.values(fields);
  };

  // Helper function to resolve placeholders in any text string (Filename, QR Content, etc.)
  // Handles text replacement, finding signature/image names from Data URLs, and Company Short Codes
  const formatContent = (pattern: string, values: Record<string, string>) => {
      if (!pattern) return '';
      return pattern.replace(/{([^{}]+)}/g, (match, label) => {
         
         // CHECK FOR SHORT NAME SUFFIX (For Companies)
         const isShortRequest = label.endsWith('_Kisa');
         const actualLabel = isShortRequest ? label.replace('_Kisa', '') : label;
         
         const val = values[actualLabel];
         if (!val) return match;
         
         // If it's a signature (URL), try to find its name
         if (val.startsWith('data:')) {
             const sig = signatures.find(s => s.url === val);
             // Return name if found (without extension), otherwise fallback
             return sig ? sig.name : 'Gorsel'; 
         }

         // If user requested Short Name, try to find the company in global list by its Full Name (value)
         if (isShortRequest) {
             const company = companies.find(c => c.name === val);
             if (company) return company.shortName;
             return val; // Fallback to full value if not found in dictionary
         }

         return val; // Normal Text value
      });
  };

  // Helper for filename generation
  const generateFilename = (pattern: string, values: Record<string, string>) => {
      const name = formatContent(pattern, values);
      // Clean up unsafe characters for filesystem
      return name.replace(/[^a-z0-9ğüşıöçĞÜŞİÖÇ\- ]/gi, '_') + '.pdf';
  };

  // Helper to wrap text on canvas for better WYSIWYG
  const getWrappedLines = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number) => {
      const words = text.split(' ');
      let lines = [];
      let currentLine = words[0];

      for (let i = 1; i < words.length; i++) {
          const word = words[i];
          const width = ctx.measureText(currentLine + " " + word).width;
          if (width < maxWidth) {
              currentLine += " " + word;
          } else {
              lines.push(currentLine);
              currentLine = word;
          }
      }
      lines.push(currentLine);
      return lines;
  };

  // --- Export PDF (Multi-Project) ---
  const exportPDF = async () => {
    const targetProjects = projects.filter(p => selectedFillProjectIds.includes(p.id));
    if (targetProjects.length === 0) return;

    // Determine filename from the FIRST project's pattern if downloading single
    const firstProj = targetProjects[0];
    const filename = generateFilename(firstProj.filenamePattern || 'Sertifika', fillValues);

    const pdf = new jsPDF({
      orientation: firstProj.width > firstProj.height ? 'landscape' : 'portrait',
      unit: 'px',
      format: [firstProj.width, firstProj.height]
    });

    let pageAdded = false;

    for (const proj of targetProjects) {
        const sides: Side[] = ['front', 'back'];
        const hasBack = proj.back.bgUrl || proj.back.elements.length > 0;
        const sidesToPrint = hasBack ? sides : ['front'];

        for (const side of sidesToPrint) {
            if (pageAdded) {
                pdf.addPage([proj.width, proj.height], proj.width > proj.height ? 'landscape' : 'portrait');
            } else {
                pageAdded = true;
            }

            const sideData = proj[side];
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

                // Determine content based on element type
                if (el.type === ElementType.QRCODE) {
                   // QR Codes use their template pattern and interpolate values
                   content = formatContent(el.content, fillValues);
                } else {
                   // Text/Image use the direct fill value if available, else template content
                   content = fillValues[el.label || ''] || el.content;
                }

                if (el.type === ElementType.SIGNATURE && !content) continue;

                if (el.type === ElementType.TEXT || el.type === ElementType.DROPDOWN || el.type === ElementType.COMPANY) {
                    ctx.font = `${el.fontStyle === 'italic' ? 'italic ' : ''}${el.fontWeight || 400} ${el.fontSize}px ${el.fontFamily?.split(',')[0]}`;
                    ctx.fillStyle = el.color || '#000';
                    // Text align logic
                    const align = el.textAlign || 'center';
                    ctx.textAlign = align as CanvasTextAlign;
                    ctx.textBaseline = 'top'; 
                    
                    const textToRender = content || '';
                    const explicitLines = textToRender.split('\n');
                    const allLines: string[] = [];
                    
                    explicitLines.forEach(line => {
                        const wrapped = getWrappedLines(ctx, line, el.width);
                        allLines.push(...wrapped);
                    });

                    // Calculate X based on alignment
                    let startX = el.x; // Default left
                    if (align === 'center') startX = el.x + (el.width / 2);
                    if (align === 'right') startX = el.x + el.width;

                    const startY = el.y; 
                    const lineHeight = el.fontSize! * 1.2;

                    allLines.forEach((line, idx) => {
                        ctx.fillText(line, startX, startY + (idx * lineHeight));
                    });
                } else if (el.type === ElementType.QRCODE) {
                    // Generate QR on the fly for export
                    try {
                        const qrDataUrl = await QRCode.toDataURL(content || ' ', {
                             width: el.width,
                             margin: 1,
                             color: {
                                 dark: el.color || '#000000',
                                 light: '#00000000'
                             }
                        });
                        const img = new Image();
                        img.src = qrDataUrl;
                         await new Promise<void>(resolve => {
                            img.onload = () => {
                                ctx.drawImage(img, el.x, el.y, el.width, el.height);
                                resolve();
                            };
                            img.onerror = () => resolve(); // proceed even if fail
                        });
                    } catch (e) { console.error("QR Export Error", e); }

                } else {
                    const img = new Image();
                    img.src = content;
                    await new Promise<void>(resolve => {
                        img.onload = () => {
                            ctx.drawImage(img, el.x, el.y, el.width, el.height);
                            resolve();
                        };
                        img.onerror = () => resolve();
                    });
                }
            }
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, proj.width, proj.height);
        }
    }
    
    pdf.save(filename);
  };

  // --- Render Helpers ---
  const currentSideElements = activeProject[activeSide].elements;
  const currentSideBg = activeProject[activeSide].bgUrl;
  const selectedElement = currentSideElements.find(el => el.id === selectedId);

  const getPreviewElements = (proj: CertificateProject, side: Side) => {
    return proj[side].elements.map(el => {
      // Dynamic content for QR Codes based on other fields
      if (el.type === ElementType.QRCODE) {
         return { ...el, content: formatContent(el.content, fillValues) };
      }

      // Standard replacement for Text/Signatures/Dropdowns
      const val = fillValues[el.label || ''];
      if (val) return { ...el, content: val };
      return el; 
    });
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-200 overflow-hidden font-sans selection:bg-amber-500/30">
      
      {/* SIDEBAR NAVIGATION */}
      <div className="w-20 bg-slate-950 border-r border-slate-800 flex flex-col items-center py-6 gap-8 z-30 shrink-0 select-none">
        <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl flex items-center justify-center shadow-lg shadow-amber-900/40">
           <FileText className="text-white" size={24} />
        </div>
        
        <div className="flex flex-col w-full gap-4 flex-1">
           <button 
             onClick={() => setCurrentView('projects')}
             className={`p-3 w-full flex flex-col items-center gap-1 transition-all relative ${currentView === 'projects' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <FolderOpen size={24} />
             <span className="text-[10px] font-medium">Projeler</span>
             {currentView === 'projects' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r"></div>}
           </button>

           <button 
             onClick={() => setCurrentView('template')}
             className={`p-3 w-full flex flex-col items-center gap-1 transition-all relative ${currentView === 'template' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <LayoutTemplate size={24} />
             <span className="text-[10px] font-medium">Şablon</span>
             {currentView === 'template' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r"></div>}
           </button>

           <button 
             onClick={() => setCurrentView('settings')}
             className={`p-3 w-full flex flex-col items-center gap-1 transition-all relative ${currentView === 'settings' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <Settings size={24} />
             <span className="text-[10px] font-medium">Ayarlar</span>
             {currentView === 'settings' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r"></div>}
           </button>

           <button 
             onClick={() => setCurrentView('fill')}
             className={`p-3 w-full flex flex-col items-center gap-1 transition-all relative ${currentView === 'fill' ? 'text-amber-500 bg-slate-800/50' : 'text-slate-500 hover:text-slate-300'}`}
           >
             <PenTool size={24} />
             <span className="text-[10px] font-medium">Doldur</span>
             {currentView === 'fill' && <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 rounded-r"></div>}
           </button>
        </div>

        {/* Sidebar Footer */}
        <div className="flex flex-col items-center gap-2 pb-2">
            <a 
                href={GITHUB_URL} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-slate-600 hover:text-white transition"
                title="GitHub'da Görüntüle"
            >
                <Github size={20} />
            </a>
            <span className="text-[9px] text-slate-600 font-mono">{APP_VERSION}</span>
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* VIEW: PROJECTS LIST */}
        {currentView === 'projects' && (
             <div className="flex-1 bg-slate-900 p-10 overflow-y-auto">
                <div className="max-w-6xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-3xl font-bold mb-1 text-white">Projelerim</h1>
                            <p className="text-slate-400">Tüm sertifika çalışmalarınız burada.</p>
                        </div>
                        <button 
                            onClick={handleCreateProject}
                            className="bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-lg flex items-center gap-2 font-bold transition shadow-lg shadow-amber-900/20 active:scale-95 transform"
                        >
                            <Plus size={20} /> Yeni Proje
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {projects.map(p => (
                            <div 
                                key={p.id} 
                                onClick={() => { setActiveProjectId(p.id); setCurrentView('template'); }}
                                className={`bg-slate-800 border-2 rounded-xl p-5 cursor-pointer transition group hover:shadow-xl hover:-translate-y-1 relative overflow-hidden ${activeProjectId === p.id ? 'border-amber-500 ring-2 ring-amber-500/20' : 'border-slate-700 hover:border-slate-500'}`}
                            >
                                <div className="h-40 bg-slate-900/50 rounded-lg mb-4 flex items-center justify-center overflow-hidden relative">
                                    {p.front.bgUrl ? (
                                        <img src={p.front.bgUrl} className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition duration-500" />
                                    ) : (
                                        <FileText size={40} className="text-slate-700" />
                                    )}
                                    <div className="absolute top-2 right-2 bg-black/60 px-2 py-1 rounded text-[10px] text-white backdrop-blur">
                                        Ön Yüz
                                    </div>
                                </div>
                                <div className="flex justify-between items-start">
                                    <div className="flex-1 min-w-0 pr-2">
                                        <h3 className="font-bold text-lg text-slate-100 group-hover:text-amber-500 transition truncate">{p.name}</h3>
                                        <p className="text-xs text-slate-500 mt-1">{new Date(p.createdAt).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex flex-col gap-1">
                                        <button 
                                            onClick={(e) => handleDuplicateProject(p.id, e)}
                                            className="p-2 text-slate-500 hover:text-blue-500 hover:bg-blue-500/10 rounded-full transition shrink-0"
                                            title="Projeyi Kopyala"
                                        >
                                            <Copy size={18} />
                                        </button>
                                        <button 
                                            onClick={(e) => handleDeleteProject(p.id, e)}
                                            className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-full transition shrink-0"
                                            title="Projeyi Sil"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                                {activeProjectId === p.id && (
                                    <div className="absolute top-0 right-0 bg-amber-500 text-black text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">
                                        AKTİF
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
             </div>
        )}

        {/* VIEW: TEMPLATE EDITOR */}
        {currentView === 'template' && (
          <>
            {/* Left Panel: Tools */}
            <div className="w-72 bg-slate-800 border-r border-slate-700 flex flex-col z-20 shadow-xl flex-shrink-0 select-none">
               <div className="p-5 border-b border-slate-700 bg-slate-800 group relative">
                 {/* Project Rename Logic */}
                 {isEditingName ? (
                     <input 
                        ref={projectNameInputRef}
                        type="text"
                        value={activeProject.name}
                        onChange={(e) => updateProjectMeta({ name: e.target.value })}
                        onBlur={() => setIsEditingName(false)}
                        onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                        className="w-full bg-slate-900 border border-amber-500 rounded px-2 py-1 text-sm text-white outline-none font-bold"
                     />
                 ) : (
                     <div className="flex items-center justify-between group-hover:bg-slate-700/50 p-1 rounded -ml-1 cursor-pointer" onClick={() => setIsEditingName(true)}>
                         <div className="overflow-hidden">
                             <h2 className="text-lg font-bold text-white truncate" title={activeProject.name}>{activeProject.name}</h2>
                             <p className="text-xs text-slate-400">Şablon Düzenleyici</p>
                         </div>
                         <Edit2 size={14} className="text-slate-500 opacity-0 group-hover:opacity-100 transition" />
                     </div>
                 )}
               </div>
               
               <div className="p-4 space-y-6 overflow-y-auto custom-scrollbar">
                 {/* Orientation Control */}
                 <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Sayfa Düzeni</h3>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
                        <button
                            onClick={() => handleOrientationChange('landscape')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition ${activeProject.width > activeProject.height ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <RectangleHorizontal size={16} /> Yatay
                        </button>
                        <button
                            onClick={() => handleOrientationChange('portrait')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded text-xs font-medium transition ${activeProject.height > activeProject.width ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
                        >
                            <RectangleVertical size={16} /> Dikey
                        </button>
                    </div>
                 </div>

                 <div className="h-[1px] bg-slate-700"></div>

                 <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Arkaplan ({activeSide === 'front' ? 'Ön' : 'Arka'})</h3>
                    <input type="file" ref={fileInputRef} onChange={handleTemplateUpload} accept="image/*" className="hidden" />
                    <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 border-2 border-dashed border-slate-600 rounded-xl hover:bg-slate-700/50 hover:border-slate-400 transition text-slate-400 text-sm flex flex-col items-center gap-2">
                      <Upload size={20} /> Arkaplan Değiştir
                    </button>
                 </div>

                 <div className="h-[1px] bg-slate-700"></div>

                 <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider">Bileşen Ekle</h3>
                    <button onClick={() => addElement(ElementType.TEXT)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200">
                      <Type size={18} /> Metin Alanı
                    </button>
                    <button onClick={() => addElement(ElementType.DROPDOWN)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200">
                      <List size={18} /> Seçenekli Alan
                    </button>
                    <button onClick={() => addElement(ElementType.COMPANY)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200">
                      <Building size={18} /> Firma Ekle
                    </button>
                    <button onClick={() => addElement(ElementType.QRCODE)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200">
                      <QrCode size={18} /> QR Kod
                    </button>
                    <button onClick={() => addElement(ElementType.SIGNATURE)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200">
                      <PenTool size={18} /> İmza Alanı
                    </button>

                    <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                    <button onClick={() => addElement(ElementType.IMAGE)} className="w-full py-3 bg-slate-700 hover:bg-slate-600 rounded-lg flex items-center justify-center gap-2 transition text-sm text-slate-200">
                      <ImageIcon size={18} /> Logo / Resim
                    </button>
                 </div>

                 {/* QR CODE SETTINGS SIDEBAR SECTION */}
                 {selectedElement && selectedElement.type === ElementType.QRCODE && (
                   <div className="space-y-3 mt-4 pt-4 border-t border-slate-700 animate-in fade-in slide-in-from-left-4">
                       <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2">
                           <QrCode size={14} className="text-amber-500"/> QR İçerik Ayarları
                       </h3>
                       <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 space-y-2">
                           <p className="text-[10px] text-slate-400">QR Koda eklenecek verileri seçin:</p>
                           <textarea
                               rows={3}
                               value={selectedElement.content}
                               onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })}
                               className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none resize-none"
                               placeholder="Örn: {Ad Soyad} - {Tarih}"
                           />
                           <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto custom-scrollbar">
                               {getProjectLabels().map(label => (
                                   <button 
                                       key={label}
                                       onClick={() => {
                                           const current = selectedElement.content || '';
                                           updateElement(selectedElement.id, { content: current + (current ? ' ' : '') + `{${label}}` });
                                       }}
                                       className="text-[10px] px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-amber-200/80 hover:text-white transition border border-slate-600 flex items-center gap-1"
                                   >
                                       <Plus size={8} /> {label}
                                   </button>
                               ))}
                           </div>
                       </div>
                   </div>
                 )}

                 <div className="h-[1px] bg-slate-700 mt-4"></div>

                 {/* Filename Settings in Template View */}
                 <div className="space-y-3 mt-4">
                      <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider flex items-center gap-2">
                          <FileBadge size={14} /> Proje Ayarları & Çıktı
                      </h3>
                      <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 space-y-2">
                          <label className="text-[10px] font-bold text-slate-400 block">PDF Dosya Adı Formatı</label>
                          <input 
                              type="text" 
                              value={activeProject.filenamePattern || 'Sertifika-{Ad Soyad}'}
                              onChange={(e) => updateProjectMeta({ filenamePattern: e.target.value })}
                              className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-white focus:border-amber-500 outline-none"
                              placeholder="Örn: {Ad Soyad}-{Tarih}"
                          />
                          <div className="text-[9px] text-slate-500 mb-1">Mevcut etiketleri ekle:</div>
                          <div className="flex flex-wrap gap-1">
                              {getProjectLabels().map(label => (
                                  <button 
                                      key={label}
                                      onClick={() => {
                                          const current = activeProject.filenamePattern || '';
                                          updateProjectMeta({ filenamePattern: current + `{${label}}` });
                                      }}
                                      className={`text-[10px] px-2 py-0.5 rounded transition border border-slate-600 hover:border-slate-500 ${label.endsWith('_Kisa') ? 'bg-slate-800 text-amber-500 border-amber-500/30' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
                                      title={label.endsWith('_Kisa') ? "Firma kısaltmasını ekle" : "Değeri ekle"}
                                  >
                                      + {label}
                                  </button>
                              ))}
                          </div>
                      </div>
                 </div>
               </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 flex flex-col relative bg-[#0b0f19]">
              {/* Properties Bar & Side Toggle */}
              <div className="h-16 bg-slate-800 border-b border-slate-700 flex items-center px-6 gap-4 justify-between relative select-none">
                 
                 {/* Left: Element Properties */}
                 <div className="flex items-center gap-3 overflow-x-auto flex-1 no-scrollbar pr-4">
                     {selectedElement ? (
                    <>
                        <span className="text-xs font-bold text-amber-500 uppercase whitespace-nowrap">{selectedElement.type === ElementType.COMPANY ? 'FİRMA' : selectedElement.type}</span>
                        <input 
                        value={selectedElement.label || ''} 
                        onChange={(e) => updateElement(selectedElement.id, { label: e.target.value })}
                        className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-32 focus:border-amber-500 outline-none shrink-0"
                        placeholder="Etiket"
                        title="Doldurma ekranında aynı etikete sahip alanlar birleşir"
                        />
                        {(selectedElement.type === ElementType.TEXT || selectedElement.type === ElementType.DROPDOWN || selectedElement.type === ElementType.QRCODE || selectedElement.type === ElementType.COMPANY) && (
                        <>
                            <div className="w-[1px] h-6 bg-slate-600 mx-2 shrink-0"></div>
                            
                            {selectedElement.type !== ElementType.QRCODE && (
                            <>
                                {/* Font Family */}
                                <select 
                                    value={selectedElement.fontFamily} 
                                    onChange={(e) => updateElement(selectedElement.id, { fontFamily: e.target.value })} 
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-36 shrink-0"
                                >
                                    {FONTS.map(group => (
                                        <optgroup key={group.group} label={group.group}>
                                            {group.options.map(f => (
                                                <option key={f.value} value={f.value}>{f.name}</option>
                                            ))}
                                        </optgroup>
                                    ))}
                                </select>

                                {/* Font Weight */}
                                <select 
                                    value={selectedElement.fontWeight || 400} 
                                    onChange={(e) => updateElement(selectedElement.id, { fontWeight: Number(e.target.value) })} 
                                    className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-24 shrink-0"
                                >
                                    {FONT_WEIGHTS.map(w => (
                                        <option key={w.value} value={w.value}>{w.name}</option>
                                    ))}
                                </select>

                                {/* Alignment Controls */}
                                <div className="flex items-center bg-slate-900 rounded border border-slate-600 shrink-0">
                                    <button 
                                        onClick={() => updateElement(selectedElement.id, { textAlign: 'left' })}
                                        className={`p-1.5 hover:bg-slate-700 ${selectedElement.textAlign === 'left' ? 'bg-slate-700 text-amber-500' : 'text-slate-400'}`}
                                        title="Sola Yasla"
                                    >
                                        <AlignLeft size={16} />
                                    </button>
                                    <div className="w-[1px] h-4 bg-slate-700"></div>
                                    <button 
                                        onClick={() => updateElement(selectedElement.id, { textAlign: 'center' })}
                                        className={`p-1.5 hover:bg-slate-700 ${(!selectedElement.textAlign || selectedElement.textAlign === 'center') ? 'bg-slate-700 text-amber-500' : 'text-slate-400'}`}
                                        title="Ortala"
                                    >
                                        <AlignCenter size={16} />
                                    </button>
                                    <div className="w-[1px] h-4 bg-slate-700"></div>
                                    <button 
                                        onClick={() => updateElement(selectedElement.id, { textAlign: 'right' })}
                                        className={`p-1.5 hover:bg-slate-700 ${selectedElement.textAlign === 'right' ? 'bg-slate-700 text-amber-500' : 'text-slate-400'}`}
                                        title="Sağa Yasla"
                                    >
                                        <AlignRight size={16} />
                                    </button>
                                </div>

                                {/* Italic Toggle */}
                                <button 
                                    onClick={() => updateElement(selectedElement.id, { fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic' })}
                                    className={`w-8 h-8 rounded flex items-center justify-center shrink-0 border ${selectedElement.fontStyle === 'italic' ? 'bg-slate-700 border-amber-500 text-amber-500' : 'bg-transparent border-transparent hover:bg-slate-800'}`}
                                    title="İtalik"
                                >
                                    <Italic size={16} />
                                </button>
                                
                                <input type="number" value={Math.round(selectedElement.fontSize || 0)} onChange={(e) => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })} className="w-16 bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm text-center shrink-0" title="Font Boyutu" />
                            </>
                            )}
                            
                            <input type="color" value={selectedElement.color} onChange={(e) => updateElement(selectedElement.id, { color: e.target.value })} className="w-8 h-8 rounded bg-transparent border-none cursor-pointer shrink-0" title="Renk" />
                            
                            {/* Dropdown specific button */}
                            {selectedElement.type === ElementType.DROPDOWN && (
                                <button 
                                    onClick={() => setShowOptionManager(true)}
                                    className="flex items-center gap-1 bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded text-xs text-white border border-blue-600 ml-2 whitespace-nowrap transition"
                                >
                                    <List size={12} />
                                    Seçenekleri Düzenle ({selectedElement.options?.length || 0})
                                </button>
                            )}
                            {/* Text specific content input */}
                            {selectedElement.type === ElementType.TEXT && (
                                <input value={selectedElement.content} onChange={(e) => updateElement(selectedElement.id, { content: e.target.value })} className="bg-slate-900 border border-slate-600 rounded px-2 py-1 text-sm w-32 shrink-0" placeholder="Örn metin" />
                            )}
                            {/* QR CODE input removed from TOP BAR, moved to SIDEBAR */}
                        </>
                        )}
                        
                        {selectedElement.type === ElementType.SIGNATURE && (
                            <button 
                                onClick={() => setShowSigPermissions(true)}
                                className="flex items-center gap-1 bg-slate-700 hover:bg-slate-600 px-3 py-1 rounded text-xs text-white border border-slate-600 ml-2 whitespace-nowrap transition"
                            >
                                <Filter size={12} />
                                İmza İzinleri ({selectedElement.allowedSignatureIds?.length || 'Tümü'})
                            </button>
                        )}
                    </>
                    ) : <span className="text-sm text-slate-500">Özellikler için bileşen seçin</span>}
                 </div>

                 {/* Right: Side Toggle */}
                 <div className="flex bg-slate-900 p-1 rounded-lg shrink-0">
                     <button 
                        onClick={() => { setActiveSide('front'); setSelectedId(null); }}
                        className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeSide === 'front' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                     >
                        Ön Yüz
                     </button>
                     <button 
                        onClick={() => { setActiveSide('back'); setSelectedId(null); }}
                        className={`px-4 py-1.5 text-sm rounded-md transition font-medium ${activeSide === 'back' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                     >
                        Arka Yüz
                     </button>
                 </div>
              </div>

              <div ref={editorContainerRef} className="flex-1 overflow-hidden relative flex items-center justify-center p-10 bg-dots-pattern" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                <CanvasEditor 
                  elements={currentSideElements} 
                  width={activeProject.width}
                  height={activeProject.height}
                  bgUrl={currentSideBg}
                  selectedId={selectedId} 
                  onSelect={setSelectedId} 
                  onUpdateElement={updateElement} 
                  onDeleteElement={deleteElement} 
                  scale={scale} 
                />
              </div>

              {/* MODAL: SIGNATURE PERMISSIONS */}
              {showSigPermissions && selectedElement && selectedElement.type === ElementType.SIGNATURE && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                      <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-[500px] max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                          <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
                              <div>
                                  <h3 className="font-bold text-white flex items-center gap-2">
                                      <Filter size={18} className="text-amber-500"/>
                                      İmza Kısıtlamaları
                                  </h3>
                                  <p className="text-xs text-slate-400 mt-1">Bu alana (Etiket: {selectedElement.label}) hangi imzaların eklenebileceğini seçin.</p>
                              </div>
                              <button onClick={() => setShowSigPermissions(false)} className="p-2 hover:bg-slate-700 rounded-full transition text-slate-400 hover:text-white"><X size={20} /></button>
                          </div>
                          
                          <div className="p-5 overflow-y-auto flex-1 space-y-3 bg-slate-900">
                               {signatures.length === 0 ? (
                                   <div className="text-center py-10 text-slate-500 bg-slate-800/50 rounded-lg border border-slate-700 border-dashed">
                                       <AlertCircle className="mx-auto mb-2" />
                                       Henüz hiç imza yüklenmemiş.
                                       <div className="text-xs mt-2">Ayarlar sekmesinden imza yükleyebilirsiniz.</div>
                                   </div>
                               ) : (
                                   <div className="grid grid-cols-1 gap-2">
                                       <div 
                                           onClick={() => updateElement(selectedElement.id, { allowedSignatureIds: undefined })}
                                           className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer border transition ${!selectedElement.allowedSignatureIds || selectedElement.allowedSignatureIds.length === 0 ? 'bg-amber-900/20 border-amber-600/50' : 'bg-slate-800 border-slate-700 hover:bg-slate-800/80'}`}
                                       >
                                            {(!selectedElement.allowedSignatureIds || selectedElement.allowedSignatureIds.length === 0) 
                                                ? <CheckSquare size={20} className="text-amber-500" /> 
                                                : <Square size={20} className="text-slate-600" />
                                            }
                                            <span className="font-medium text-sm">Tüm İmzalara İzin Ver</span>
                                       </div>
                                       
                                       <div className="my-2 h-[1px] bg-slate-800"></div>
                                       <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">VEYA SEÇİMLİ İZİN VER</div>

                                       {signatures.map(sig => {
                                            const isChecked = selectedElement.allowedSignatureIds?.includes(sig.id);
                                            return (
                                                <div 
                                                    key={sig.id} 
                                                    onClick={() => toggleAllowedSignature(selectedElement.id, sig.id)}
                                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border transition ${isChecked ? 'bg-slate-800 border-amber-500' : 'bg-slate-900 border-slate-800 hover:border-slate-700'}`}
                                                >
                                                    {isChecked ? <CheckSquare size={20} className="text-green-500" /> : <Square size={20} className="text-slate-600" />}
                                                    <div className="w-12 h-8 bg-white rounded p-1 flex items-center justify-center">
                                                        <img src={sig.url} className="max-w-full max-h-full" alt="" />
                                                    </div>
                                                    <span className="text-sm">{sig.name}</span>
                                                </div>
                                            )
                                       })}
                                   </div>
                               )}
                          </div>
                          <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-xl flex justify-end">
                              <button 
                                onClick={() => setShowSigPermissions(false)}
                                className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2 rounded-lg font-medium transition shadow-lg"
                              >
                                Tamam
                              </button>
                          </div>
                      </div>
                  </div>
              )}

              {/* MODAL: DROPDOWN OPTIONS MANAGER */}
              {showOptionManager && selectedElement && selectedElement.type === ElementType.DROPDOWN && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                      <div className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-[500px] max-h-[80vh] flex flex-col animate-in fade-in zoom-in duration-200">
                          <div className="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800 rounded-t-xl">
                              <div>
                                  <h3 className="font-bold text-white flex items-center gap-2">
                                      <List size={18} className="text-blue-500"/>
                                      Seçenek Yönetimi
                                  </h3>
                                  <p className="text-xs text-slate-400 mt-1">Bu alan (Etiket: {selectedElement.label}) için kullanıcıların seçebileceği değerleri girin.</p>
                              </div>
                              <button onClick={() => setShowOptionManager(false)} className="p-2 hover:bg-slate-700 rounded-full transition text-slate-400 hover:text-white"><X size={20} /></button>
                          </div>
                          
                          <div className="p-5 overflow-y-auto flex-1 bg-slate-900 flex flex-col gap-4">
                               {/* Add New Option */}
                               <div className="flex gap-2">
                                    <input 
                                        type="text" 
                                        value={tempOptionInput}
                                        onChange={(e) => setTempOptionInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addOption(selectedElement.id)}
                                        className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                                        placeholder="Yeni seçenek yazın..."
                                        autoFocus
                                    />
                                    <button 
                                        onClick={() => addOption(selectedElement.id)}
                                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition"
                                    >
                                        Ekle
                                    </button>
                               </div>

                               <div className="border-t border-slate-800 pt-2">
                                   <div className="text-xs font-bold text-slate-500 uppercase mb-2">MEVCUT SEÇENEKLER</div>
                                   <div className="space-y-2">
                                        {!selectedElement.options || selectedElement.options.length === 0 ? (
                                            <div className="text-sm text-slate-500 italic text-center py-4">Henüz seçenek eklenmemiş.</div>
                                        ) : (
                                            selectedElement.options.map((opt, idx) => (
                                                <div key={idx} className="flex justify-between items-center bg-slate-800 p-2 rounded-lg border border-slate-700 group hover:border-slate-600">
                                                    <span className="text-sm">{opt}</span>
                                                    <button 
                                                        onClick={() => removeOption(selectedElement.id, idx)}
                                                        className="text-slate-500 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ))
                                        )}
                                   </div>
                               </div>
                          </div>
                          <div className="p-4 border-t border-slate-700 bg-slate-800 rounded-b-xl flex justify-end">
                              <button 
                                onClick={() => setShowOptionManager(false)}
                                className="bg-slate-600 hover:bg-slate-500 text-white px-6 py-2 rounded-lg font-medium transition"
                              >
                                Kapat
                              </button>
                          </div>
                      </div>
                  </div>
              )}
            </div>
          </>
        )}

        {/* VIEW: SETTINGS */}
        {currentView === 'settings' && (
          <div className="flex-1 bg-slate-900 p-10 overflow-y-auto custom-scrollbar">
             <div className="max-w-4xl mx-auto space-y-8">
                <div>
                    <h1 className="text-3xl font-bold mb-2 text-white">Ayarlar & Varlıklar</h1>
                    <p className="text-slate-400">Uygulama genel ayarları ve varlık yönetimi.</p>
                </div>

                {/* PROJECT ACTIONS (RENAME ONLY) */}
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

                {/* COMPANY LIST SETTINGS */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                   <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-semibold flex items-center gap-2 text-white"><Building className="text-green-500" /> Firma Listesi Yönetimi</h2>
                      <span className="text-xs bg-slate-700 px-2 py-1 rounded text-slate-300">Toplam: {companies.length}</span>
                   </div>
                   
                   <p className="text-sm text-slate-400 mb-4">Sertifikalarda kullanılacak firma/kurum isimlerini buraya ekleyin. Kısaltma belirlemek için "|" karakterini kullanın (Örn: "Acme Şirketi | Acme").</p>

                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Add Area */}
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

                        {/* List Area */}
                        <div className="space-y-2 flex flex-col h-full">
                            <label className="text-xs font-bold text-slate-500 uppercase">Mevcut Liste</label>
                            <div className="bg-slate-900/50 rounded-lg border border-slate-700 p-2 flex-1 max-h-[200px] overflow-y-auto custom-scrollbar space-y-1">
                                {companies.length === 0 ? (
                                    <div className="text-center py-8 text-slate-500 text-sm italic">Liste boş.</div>
                                ) : (
                                    companies.map((company, idx) => (
                                        <div key={idx} className="flex justify-between items-center p-2 bg-slate-800 rounded group hover:bg-slate-700 transition">
                                            <div className="flex flex-col truncate pr-2">
                                                <span className="text-sm text-slate-200">{company.name}</span>
                                                {company.shortName !== company.name && (
                                                    <span className="text-[10px] text-slate-500 font-mono">Kısaltma: {company.shortName}</span>
                                                )}
                                            </div>
                                            <button 
                                                onClick={() => removeCompany(company.id)}
                                                className="text-slate-500 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                   </div>
                </div>

                {/* SIGNATURES SECTION */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                   <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-semibold flex items-center gap-2 text-white"><PenTool className="text-amber-500" /> Kayıtlı İmzalar</h2>
                      <div className="flex gap-2">
                        {/* New Draw Signature Button */}
                        <button 
                            onClick={() => setShowSignaturePad(true)}
                            className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 font-medium transition shadow-sm border border-slate-600"
                        >
                            <PenLine size={18} /> İmza Çiz
                        </button>
                        
                        <label className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg cursor-pointer flex items-center gap-2 font-medium transition shadow-lg shadow-amber-900/20 active:scale-95 transform">
                            <Plus size={18} /> İmza Yükle
                            <input type="file" accept="image/*" multiple className="hidden" onChange={handleSignatureUpload} />
                        </label>
                      </div>
                   </div>

                   {signatures.length === 0 ? (
                     <div className="text-center py-10 border-2 border-dashed border-slate-700 rounded-xl bg-slate-800/50">
                        <Upload className="mx-auto text-slate-600 mb-4" size={40} />
                        <p className="text-slate-500 text-sm">Henüz hiç imza yüklenmemiş.</p>
                     </div>
                   ) : (
                     <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {signatures.map(sig => (
                          <div key={sig.id} className="group relative bg-white rounded-xl p-4 flex items-center justify-center h-32 shadow-sm border border-slate-600 transition hover:border-amber-500/50">
                             <img src={sig.url} alt={sig.name} className="max-h-full max-w-full object-contain" />
                             <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-xl backdrop-blur-sm">
                                <button onClick={() => deleteSignature(sig.id)} className="bg-red-500 p-2 rounded-full text-white hover:bg-red-600 shadow-lg transform active:scale-95 transition">
                                  <Trash2 size={20} />
                                </button>
                             </div>
                             <div className="absolute bottom-2 left-2 right-2 text-center">
                               <span className="text-[10px] bg-slate-900/90 text-white px-2 py-1 rounded truncate block border border-slate-700 shadow-sm">{sig.name}</span>
                             </div>
                          </div>
                        ))}
                     </div>
                   )}
                </div>

                {/* BACKUP & RESTORE SECTION */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                   <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-white"><Database className="text-blue-500" /> Yedekleme ve Geri Yükleme</h2>
                   <p className="text-sm text-slate-400 mb-6">Tüm projelerinizi, şablonlarınızı, ayarlarınızı ve yüklediğiniz görselleri (imzalar dahil) tek bir dosya olarak yedekleyin veya başka bir cihaza taşıyın.</p>
                   
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                       {/* EXPORT */}
                       <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center text-center hover:border-slate-600 transition">
                           <DownloadCloud size={40} className="text-green-500 mb-4" />
                           <h3 className="font-bold text-white mb-2">Sistemi Yedekle</h3>
                           <p className="text-xs text-slate-400 mb-4">Tüm verileri (projeler, görseller, ayarlar) içeren tek bir .json dosyası indirir.</p>
                           <button 
                             onClick={handleExportBackup}
                             className="mt-auto bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition w-full shadow-lg shadow-green-900/20 active:scale-95"
                           >
                             Yedek Dosyasını İndir
                           </button>
                       </div>

                       {/* IMPORT */}
                       <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex flex-col items-center text-center hover:border-slate-600 transition">
                           <UploadCloud size={40} className="text-blue-500 mb-4" />
                           <h3 className="font-bold text-white mb-2">Yedeği Geri Yükle</h3>
                           <p className="text-xs text-slate-400 mb-4">Daha önce aldığınız yedek dosyasını seçerek tüm verilerinizi geri yükleyin.</p>
                           
                           <div className="mt-auto w-full relative">
                               <input 
                                 ref={backupInputRef}
                                 type="file" 
                                 accept=".json" 
                                 onChange={handleImportBackup} 
                                 className="hidden" 
                                 id="backup-upload"
                               />
                               <label 
                                 htmlFor="backup-upload"
                                 className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition w-full flex items-center justify-center cursor-pointer shadow-lg shadow-blue-900/20 active:scale-95"
                               >
                                 Dosya Seç ve Yükle
                               </label>
                           </div>
                           <div className="flex items-center gap-2 mt-3 text-[10px] text-amber-500">
                               <AlertTriangle size={12} />
                               <span>Dikkat: Mevcut verilerin üzerine yazılacaktır.</span>
                           </div>
                       </div>
                   </div>
                </div>

                {/* ABOUT & GITHUB SECTION */}
                <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                    <h2 className="text-xl font-semibold flex items-center gap-2 mb-4 text-white"><Github className="text-white" /> Hakkında & GitHub</h2>
                    <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-700 flex items-start gap-4">
                        <div className="p-3 bg-slate-800 rounded-full">
                            <Monitor size={24} className="text-slate-400" />
                        </div>
                        <div className="flex-1">
                            <h3 className="font-bold text-white text-lg">ProCertify Studio <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full ml-2">{APP_VERSION}</span></h3>
                            <p className="text-sm text-slate-400 mt-1 mb-4">
                                Açık kaynak kodlu, profesyonel sertifika tasarım ve yönetim aracı. Projeyi GitHub üzerinde destekleyebilir veya katkıda bulunabilirsiniz.
                            </p>
                            <a 
                                href={GITHUB_URL} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 text-sm text-white bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition border border-slate-600"
                            >
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
           <div className="flex-1 flex">
              {/* Form Input Area */}
              <div className="w-96 bg-slate-800 border-r border-slate-700 flex flex-col z-20 overflow-hidden">
                 <div className="p-5 border-b border-slate-700 bg-slate-900 shrink-0 select-none">
                   <h2 className="text-xl font-bold text-white mb-1">Sertifika Doldur</h2>
                   <p className="text-xs text-slate-400">Birden fazla proje seçip tek seferde doldurun.</p>
                 </div>

                 {/* Project Selector */}
                 <div className="p-4 border-b border-slate-700 bg-slate-800/50 shrink-0 max-h-48 overflow-y-auto custom-scrollbar">
                     <h3 className="text-xs font-bold uppercase text-slate-500 mb-2 select-none">Doldurulacak Projeler</h3>
                     <div className="space-y-2">
                        {projects.map(p => {
                            const isSelected = selectedFillProjectIds.includes(p.id);
                            return (
                                <div key={p.id} 
                                     onClick={() => {
                                        if (isSelected) {
                                            if (selectedFillProjectIds.length > 1) setSelectedFillProjectIds(prev => prev.filter(id => id !== p.id));
                                        } else {
                                            setSelectedFillProjectIds(prev => [...prev, p.id]);
                                        }
                                     }}
                                     className={`flex items-center gap-2 p-2 rounded cursor-pointer border select-none transition ${isSelected ? 'bg-amber-900/20 border-amber-600/50' : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`}
                                >
                                    {isSelected ? <CheckSquare size={16} className="text-amber-500" /> : <Square size={16} className="text-slate-600" />}
                                    <span className={`text-sm ${isSelected ? 'text-amber-100' : 'text-slate-400'}`}>{p.name}</span>
                                </div>
                            )
                        })}
                     </div>
                 </div>
                 
                 {/* Form Fields */}
                 <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                    {getUnifiedFillFields().length === 0 ? (
                      <div className="text-slate-500 text-center py-10 select-none">
                        Seçili projelerde doldurulacak ortak alan bulunamadı veya seçim yapmadınız.
                      </div>
                    ) : (
                        getUnifiedFillFields().map((field, idx) => (
                       <div key={idx} className="space-y-2">
                          <label className="text-sm font-medium text-amber-500 flex justify-between select-none">
                            <span>{field.label}</span>
                            <span className="text-slate-500 text-[10px] bg-slate-900 px-2 rounded uppercase">
                                {field.type === ElementType.DROPDOWN ? 'SEÇENEK' : (field.type === ElementType.COMPANY ? 'FİRMA' : (field.type === ElementType.QRCODE ? 'QR VERİSİ' : field.type))}
                            </span>
                          </label>
                          
                          {(field.type === ElementType.TEXT || field.type === ElementType.QRCODE) && (
                            <input 
                              type="text" 
                              value={fillValues[field.label] || ''}
                              onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-amber-500 outline-none text-white placeholder-slate-600 transition"
                              placeholder={field.type === ElementType.QRCODE ? "https://site.com" : "Metin değeri girin"}
                            />
                          )}

                          {field.type === ElementType.DROPDOWN && (
                            <div className="relative">
                                <select 
                                    value={fillValues[field.label] || ''}
                                    onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-amber-500 outline-none text-white appearance-none cursor-pointer hover:bg-slate-800 transition"
                                >
                                    <option value="">Bir seçenek belirleyin...</option>
                                    {field.options && field.options.map((opt, i) => (
                                        <option key={i} value={opt}>{opt}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                            </div>
                          )}

                          {/* COMPANY SELECTION FIELD */}
                          {field.type === ElementType.COMPANY && (
                            <div className="relative">
                                <select 
                                    value={fillValues[field.label] || ''}
                                    onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-green-500 outline-none text-white appearance-none cursor-pointer hover:bg-slate-800 transition"
                                >
                                    <option value="">Firma Seçiniz...</option>
                                    {companies.map((company, i) => (
                                        <option key={i} value={company.name}>{company.name}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                                {companies.length === 0 && (
                                    <div className="text-[10px] text-red-400 mt-1">
                                        Firma listesi boş. Ayarlar sekmesinden ekleyebilirsiniz.
                                    </div>
                                )}
                            </div>
                          )}

                          {field.type === ElementType.SIGNATURE && (
                            <div className="relative">
                              <select
                                 value={fillValues[field.label] || ''}
                                 onChange={(e) => setFillValues(prev => ({ ...prev, [field.label]: e.target.value }))}
                                 className="w-full bg-slate-900 border border-slate-600 rounded-lg px-4 py-3 focus:border-amber-500 outline-none text-white appearance-none cursor-pointer hover:bg-slate-800 transition"
                              >
                                 <option value="">İmza Seçiniz...</option>
                                 {signatures
                                    .filter(sig => !field.allowedSignatureIds || field.allowedSignatureIds.length === 0 || field.allowedSignatureIds.includes(sig.id))
                                    .map(sig => (
                                       <option key={sig.id} value={sig.url}>{sig.name}</option>
                                 ))}
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">▼</div>
                              {field.allowedSignatureIds && field.allowedSignatureIds.length > 0 && (
                                  <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                      <Filter size={10} /> Bu alan için {field.allowedSignatureIds.length} adet imza tanımlı.
                                  </div>
                              )}
                            </div>
                          )}
                       </div>
                      ))
                    )}
                 </div>

                 <div className="p-6 border-t border-slate-700 bg-slate-900 shrink-0 select-none">
                    <button 
                      onClick={exportPDF}
                      className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 transition active:scale-95 transform"
                    >
                      <Download size={22} />
                      PDF OLUŞTUR ({selectedFillProjectIds.length})
                    </button>
                 </div>
              </div>

              {/* LIST PREVIEW MODE */}
              <div className="flex-1 bg-[#0b0f19] overflow-y-auto p-10 flex flex-col items-center gap-10">
                {selectedFillProjectIds.length > 0 && (
                    <div className="text-slate-500 text-sm mb-4 select-none">
                        Önizleme ({selectedFillProjectIds.length} Proje). Arka yüzü olan kartları çevirmek için üzerine tıklayın.
                    </div>
                )}

                {projects
                    .filter(p => selectedFillProjectIds.includes(p.id))
                    .map(p => {
                    const side = previewSides[p.id] || 'front';
                    const hasBack = p.back.bgUrl || p.back.elements.length > 0;
                    
                    // Standard visual width for preview list
                    const previewWidth = 700; 
                    const calcScale = previewWidth / p.width;

                    return (
                        <div 
                        key={p.id} 
                        onClick={() => {
                            if (hasBack) {
                                togglePreviewSide(p.id);
                            }
                        }}
                        className={`relative group transition-all duration-300 ${hasBack ? 'cursor-pointer' : 'cursor-default'}`}
                        >
                            {/* Header/Badge */}
                            <div className="absolute -top-3 left-4 z-10 flex gap-2 select-none">
                                <span className="bg-slate-800 text-white text-xs px-3 py-1 rounded-full border border-slate-700 shadow-lg font-bold">
                                    {p.name}
                                </span>
                                <span className={`text-xs px-2 py-1 rounded-full border shadow-lg font-bold flex items-center gap-1 ${side === 'front' ? 'bg-blue-900/80 text-blue-200 border-blue-700' : 'bg-purple-900/80 text-purple-200 border-purple-700'}`}>
                                    {side === 'front' ? 'ÖN YÜZ' : 'ARKA YÜZ'}
                                </span>
                                {hasBack && (
                                    <span className="bg-slate-700 text-slate-300 text-[10px] px-2 py-1 rounded-full border border-slate-600 flex items-center gap-1 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                                        <RotateCcw size={10} /> Çevir
                                    </span>
                                )}
                            </div>

                            {/* Canvas Wrapper */}
                            <div className={`rounded-lg overflow-hidden border-4 shadow-2xl transition-colors ${activeProjectId === p.id ? 'border-amber-500/50' : 'border-slate-800'} ${hasBack ? 'hover:border-slate-600' : ''}`}>
                                <CanvasEditor 
                                    elements={getPreviewElements(p, side)} 
                                    width={p.width}
                                    height={p.height}
                                    bgUrl={p[side].bgUrl}
                                    selectedId={null} 
                                    onSelect={() => {}} 
                                    onUpdateElement={() => {}} 
                                    onDeleteElement={() => {}} 
                                    scale={calcScale} 
                                    readOnly={true}
                                />
                            </div>
                        </div>
                    );
                    })}
                    
                    {selectedFillProjectIds.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 select-none">
                            <LayoutTemplate size={48} className="mb-4 opacity-20" />
                            <p>Önizleme için soldan proje seçiniz.</p>
                        </div>
                    )}
              </div>
           </div>
        )}

      </div>
      
      {/* Signature Pad Modal */}
      {showSignaturePad && (
        <SignaturePad 
          onSave={handleSignatureDrawSave}
          onClose={() => setShowSignaturePad(false)}
        />
      )}
    </div>
  );
};

export default App;