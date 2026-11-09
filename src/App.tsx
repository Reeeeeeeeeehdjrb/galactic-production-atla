import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./style.css";

type Kind =
  | "Raw material"
  | "Refined material"
  | "Component"
  | "Finished product";

type Ingredient = {
  resourceId: string;
  quantity: number;
};

type Zone = { id: string; x: number; y: number; width: number; height: number };
type Hotspot = { id: string; resourceId: string; x: number; y: number; width: number; height: number; zoneId: string | null };
type RenderHotspot = { id: string; resourceId: string; x: number; y: number; width: number; height: number; count: number };

type Resource = {
  id: string;
  name: string;
  category: string;
  kind: Kind;
  description: string;
  factory: string;
  ingredients: Ingredient[];
  location: string;
  supplier: string;
  owner: string;
  acquisition: string;
  notes: string;
  x?: number;
  y?: number;
};

const FACTORIES = [
  "Raw and Refined Materials",
  "Alloy Factory",
  "Component Factory",
  "Weapons Factory",
  "Droid Factory",
  "Speeder Factory",
  "Ship Factory",
  "Equipment Factory",
  "Foodstuffs Factory",
];

const KINDS: Kind[] = [
  "Raw material",
  "Refined material",
  "Component",
  "Finished product",
];

const STORAGE_KEY = "galactic-production-atlas-v1";

const SEED: Resource[] = [
  {
    id: "example-ore",
    name: "Example Ore",
    category: "Ore",
    kind: "Raw material",
    description: "Example raw material.",
    factory: FACTORIES[0],
    ingredients: [],
    location: "",
    supplier: "",
    owner: "",
    acquisition: "",
    notes: "Example entry",
    x: 12,
    y: 22,
  },
  {
    id: "example-metal",
    name: "Example Refined Metal",
    category: "Metal",
    kind: "Refined material",
    description: "Example refined material.",
    factory: FACTORIES[0],
    ingredients: [{ resourceId: "example-ore", quantity: 2 }],
    location: "",
    supplier: "",
    owner: "",
    acquisition: "",
    notes: "",
    x: 26,
    y: 22,
  },
  {
    id: "example-alloy",
    name: "Example Alloy Plate",
    category: "Alloy",
    kind: "Component",
    description: "Example manufactured component.",
    factory: FACTORIES[1],
    ingredients: [{ resourceId: "example-metal", quantity: 3 }],
    location: "",
    supplier: "",
    owner: "",
    acquisition: "",
    notes: "",
    x: 44,
    y: 22,
  },
];

const emptyResource = (): Resource => ({
  id: "",
  name: "",
  category: "",
  kind: "Raw material",
  description: "",
  factory: FACTORIES[0],
  ingredients: [],
  location: "",
  supplier: "",
  owner: "",
  acquisition: "",
  notes: "",
});

function makeId(name: string) {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${slug || "resource"}-${Date.now().toString(36)}`;
}

function readSavedResources(): Resource[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return SEED;

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) ? parsed : SEED;
  } catch {
    return SEED;
  }
}

function readSavedHotspots(): Hotspot[] {
  try {
    const saved = localStorage.getItem("galactic-production-atlas-hotspots-v2");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) return parsed.map((item: any) => ({ ...item, width: Number(item.width) || 4, height: Number(item.height) || 4 }));
    }
  } catch { /* recover from the legacy resource coordinates below */ }

  return readSavedResources()
    .filter(resource => typeof resource.x === "number" && typeof resource.y === "number")
    .map((resource, index) => ({
      id: `legacy-${resource.id}-${index}`,
      resourceId: resource.id,
      x: resource.x as number,
      y: resource.y as number,
      width: 4,
      height: 4,
      zoneId: null,
    }));
}

function App() {
  const [resources, setResources] =
    useState<Resource[]>(readSavedResources);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFactory, setActiveFactory] =
    useState("All factories");

  const [activeTab, setActiveTab] =
    useState<"details" | "chain" | "usedBy">("details");

  const [adminMode, setAdminMode] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [ingredientText, setIngredientText] = useState("");

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [placingHotspot, setPlacingHotspot] = useState(false);
  const [hotspots, setHotspots] = useState<Hotspot[]>(readSavedHotspots);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);
  const [showZoneTools, setShowZoneTools] = useState(false);
  const [drawingZone, setDrawingZone] = useState(false);
  const [zones, setZones] = useState<Zone[]>(() => {
    try { return JSON.parse(localStorage.getItem("galactic-production-atlas-zones-v1") || "[]"); }
    catch { return []; }
  });
  const [showFactoryRail, setShowFactoryRail] = useState(true);
  const [showInfoPanel, setShowInfoPanel] = useState(true);
  const [mapSize, setMapSize] = useState({ width: 1600, height: 1000 });
  const [notice, setNotice] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const drawingRef = useRef<{ x: number; y: number } | null>(null);
  const zoneDragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; zone: Zone } | null>(null);
  const hotspotDragRef = useRef<{ id: string; mode: "move" | "resize"; startX: number; startY: number; hotspot: Hotspot } | null>(null);
  const draftZoneRef = useRef<Zone | null>(null);

  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(resources)
      );
    } catch {
      setNotice("Could not save changes in this browser.");
    }
  }, [resources]);

  useEffect(() => {
    try { localStorage.setItem("galactic-production-atlas-zones-v1", JSON.stringify(zones)); }
    catch { setNotice("Could not save placement areas."); }
  }, [zones]);

  useEffect(() => {
    try { localStorage.setItem("galactic-production-atlas-hotspots-v2", JSON.stringify(hotspots)); }
    catch { setNotice("Could not save map hotspots."); }
  }, [hotspots]);

  // Areas are real map groups: hotspots inside an area are assigned to it automatically.
  useEffect(() => {
    const usableZones = zones.filter(zone => zone.id !== "draft");
    setHotspots(current => {
      let changed = false;
      const next = current.map(hotspot => {
        const containing = usableZones
          .filter(zone => hotspot.x >= zone.x && hotspot.x <= zone.x + zone.width && hotspot.y >= zone.y && hotspot.y <= zone.y + zone.height)
          .sort((a, b) => a.width * a.height - b.width * b.height)[0];
        const zoneId = containing?.id ?? null;
        if (hotspot.zoneId === zoneId) return hotspot;
        changed = true;
        return { ...hotspot, zoneId };
      });
      return changed ? next : current;
    });
    if (activeZoneId && !usableZones.some(zone => zone.id === activeZoneId)) setActiveZoneId(null);
  }, [zones]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setAdminMode(value => !value);
        setPlacingHotspot(false);
        setDrawingZone(false);
        setShowZoneTools(false);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    const handleResize = () => setPan(current => clampPan(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [zoom, mapSize]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(
      () => setNotice(""),
      3200
    );

    return () => window.clearTimeout(timer);
  }, [notice]);

  const resourceById = useMemo(
    () =>
      new Map(
        resources.map((resource) => [
          resource.id,
          resource,
        ])
      ),
    [resources]
  );

  const selected = selectedId
    ? resourceById.get(selectedId) ?? null
    : null;

  // Search resources, ingredients, and products using each resource.
  const filteredResources = useMemo(() => {
    const term = query.trim().toLowerCase();

    return resources.filter((resource) => {
      const factoryMatches =
        activeFactory === "All factories" ||
        resource.factory === activeFactory;

      if (!factoryMatches) return false;
      if (!term) return true;

      const ingredientNames = resource.ingredients
        .map(
          (ingredient) =>
            resourceById.get(ingredient.resourceId)?.name ?? ""
        )
        .join(" ");

      const usedByNames = resources
        .filter((candidate) =>
          candidate.ingredients.some(
            (ingredient) =>
              ingredient.resourceId === resource.id
          )
        )
        .map((candidate) => candidate.name)
        .join(" ");

      return [
        resource.name,
        resource.category,
        resource.kind,
        resource.factory,
        resource.description,
        ingredientNames,
        usedByNames,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [resources, query, activeFactory, resourceById]);

  // Every hotspot remains an independent invisible rectangular hit area at every zoom level.
  // Do not merge these into marker clusters: each saved rectangle must be clickable on its own.
  const renderHotspots = useMemo<RenderHotspot[]>(() => {
    const allowedIds = new Set(filteredResources.map(resource => resource.id));
    return hotspots
      .filter(hotspot => allowedIds.has(hotspot.resourceId))
      .filter(hotspot => !activeZoneId || hotspot.zoneId === activeZoneId)
      .map(hotspot => ({ ...hotspot, count: 1 }));
  }, [hotspots, filteredResources, activeZoneId]);

  const zoneHotspotCount = (zoneId: string) => hotspots.filter(hotspot => hotspot.zoneId === zoneId).length;

  // Recursively trace all ingredients needed to produce a resource.
  const getAncestors = useCallback(
    (resourceId: string) => {
      const visited = new Set<string>();

      const result: Array<{
        resource: Resource;
        depth: number;
        quantity: number;
      }> = [];

      const walk = (
        id: string,
        depth: number,
        multiplier: number
      ) => {
        const resource = resourceById.get(id);

        if (!resource) return;

        resource.ingredients.forEach((ingredient) => {
          const child = resourceById.get(
            ingredient.resourceId
          );

          if (!child || visited.has(child.id)) return;

          visited.add(child.id);

          const quantity =
            multiplier * ingredient.quantity;

          result.push({
            resource: child,
            depth: depth + 1,
            quantity,
          });

          walk(child.id, depth + 1, quantity);
        });
      };

      walk(resourceId, 0, 1);

      return result;
    },
    [resourceById]
  );

  // Recursively find all products that depend on a resource.
  const getDescendants = useCallback(
    (resourceId: string) => {
      const visited = new Set<string>();

      const result: Array<{
        resource: Resource;
        depth: number;
      }> = [];

      const walk = (id: string, depth: number) => {
        resources.forEach((candidate) => {
          const usesResource = candidate.ingredients.some(
            (ingredient) =>
              ingredient.resourceId === id
          );

          if (
            usesResource &&
            !visited.has(candidate.id)
          ) {
            visited.add(candidate.id);

            result.push({
              resource: candidate,
              depth: depth + 1,
            });

            walk(candidate.id, depth + 1);
          }
        });
      };

      walk(resourceId, 0);

      return result;
    },
    [resources]
  );

  const directOutputs = useMemo(
    () =>
      selected
        ? resources.filter((resource) =>
            resource.ingredients.some(
              (ingredient) =>
                ingredient.resourceId === selected.id
            )
          )
        : [],
    [resources, selected]
  );

  const openEditor = (resource?: Resource) => {
    const value = resource
      ? { ...resource }
      : emptyResource();

    setEditing(value);

    setIngredientText(
      value.ingredients
        .map(
          (ingredient) =>
            `${ingredient.resourceId}:${ingredient.quantity}`
        )
        .join("\n")
    );

    setIsCreating(!resource);
  };

  const saveResource = (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!editing || !editing.name.trim()) return;

    const ingredients: Ingredient[] = ingredientText
      .split(/\n|,/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [resourceId, rawQuantity] = part
          .split(":")
          .map((value) => value.trim());

        return {
          resourceId,
          quantity: Math.max(
            0.001,
            Number(rawQuantity) || 1
          ),
        };
      })
      .filter(
        (ingredient) =>
          ingredient.resourceId !== editing.id &&
          resourceById.has(ingredient.resourceId)
      );

    const saved: Resource = {
      ...editing,
      id: editing.id || makeId(editing.name),
      name: editing.name.trim(),
      ingredients,
    };

    setResources((current) => {
      const exists = current.some(
        (resource) => resource.id === saved.id
      );

      return exists
        ? current.map((resource) =>
            resource.id === saved.id ? saved : resource
          )
        : [...current, saved];
    });

    setSelectedId(saved.id);
    setEditing(null);
    setIsCreating(false);
    setNotice("Resource saved in this browser.");
  };

  const deleteResource = (resource: Resource) => {
    if (
      !window.confirm(
        `Delete "${resource.name}"? References to it will also be removed.`
      )
    ) {
      return;
    }

    setResources((current) =>
      current
        .filter((item) => item.id !== resource.id)
        .map((item) => ({
          ...item,
          ingredients: item.ingredients.filter(
            (ingredient) =>
              ingredient.resourceId !== resource.id
          ),
        }))
    );

    setHotspots(current => current.filter(hotspot => hotspot.resourceId !== resource.id));
    setSelectedId(null);
    setNotice("Resource deleted.");
  };

  const getMapPoint = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport) return { x: 50, y: 50 };
    const bounds = viewport.getBoundingClientRect();
    const baseScale = Math.max(bounds.width / mapSize.width, bounds.height / mapSize.height);
    const scale = baseScale * zoom;
    const localX = clientX - bounds.left - bounds.width / 2 - pan.x;
    const localY = clientY - bounds.top - bounds.height / 2 - pan.y;
    return {
      x: Math.max(0, Math.min(100, ((localX / scale + mapSize.width / 2) / mapSize.width) * 100)),
      y: Math.max(0, Math.min(100, ((localY / scale + mapSize.height / 2) / mapSize.height) * 100)),
    };
  };

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placingHotspot || !selected) return;
    const point = getMapPoint(event.clientX, event.clientY);
    const containing = zones
      .filter(zone => zone.id !== "draft" && point.x >= zone.x && point.x <= zone.x + zone.width && point.y >= zone.y && point.y <= zone.y + zone.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    setHotspots(current => [...current, {
      id: `hotspot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      resourceId: selected.id,
      x: point.x,
      y: point.y,
      width: 4,
      height: 4 * mapSize.width / mapSize.height,
      zoneId: containing?.id ?? null,
    }]);
    setPlacingHotspot(false);
    setNotice(`Hotspot added for ${selected.name}. You can add another one whenever you want.`);
  };

  const clampPan = (next: { x: number; y: number }, nextZoom = zoom) => {
    const viewport = viewportRef.current;
    if (!viewport) return next;
    const bounds = viewport.getBoundingClientRect();
    const baseScale = Math.max(bounds.width / mapSize.width, bounds.height / mapSize.height);
    const scale = baseScale * nextZoom;
    const maxX = Math.max(0, (mapSize.width * scale - bounds.width) / 2);
    const maxY = Math.max(0, (mapSize.height * scale - bounds.height) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, next.x)), y: Math.max(-maxY, Math.min(maxY, next.y)) };
  };

  const onWheelZoom = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const nextZoom = Math.max(1, Math.min(4, zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
    if (nextZoom === zoom) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cursor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    const ratio = nextZoom / zoom;
    const nextPan = { x: cursor.x - (cursor.x - pan.x) * ratio, y: cursor.y - (cursor.y - pan.y) * ratio };
    setPan(clampPan(nextPan, nextZoom));
    setZoom(nextZoom);
  };

  const beginZoneDraw = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingZone) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getMapPoint(event.clientX, event.clientY);
    drawingRef.current = point;
    draftZoneRef.current = { id: "draft", x: point.x, y: point.y, width: 0, height: 0 };
    setZones(current => current.filter(zone => zone.id !== "draft"));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const updateZonePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (hotspotDragRef.current) {
      const drag = hotspotDragRef.current;
      const point = getMapPoint(event.clientX, event.clientY);
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      setHotspots(current => current.map(item => {
        if (item.id !== drag.id) return item;
        const squareHeight = drag.hotspot.width * mapSize.width / mapSize.height;
        if (drag.mode === "move") return {
          ...item,
          x: Math.max(drag.hotspot.width / 2, Math.min(100 - drag.hotspot.width / 2, drag.hotspot.x + dx)),
          y: Math.max(squareHeight / 2, Math.min(100 - squareHeight / 2, drag.hotspot.y + dy)),
        };
        const verticalDeltaAsWidth = dy * mapSize.height / mapSize.width;
        const sizeDelta = Math.abs(dx) >= Math.abs(verticalDeltaAsWidth) ? dx : verticalDeltaAsWidth;
        const size = Math.max(0.5, Math.min(30, drag.hotspot.width + sizeDelta));
        return { ...item, width: size, height: size * mapSize.width / mapSize.height };
      }));
      return;
    }
    if (drawingRef.current) {
      const point = getMapPoint(event.clientX, event.clientY);
      const start = drawingRef.current;
      const draft = { id: "draft", x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), width: Math.abs(point.x - start.x), height: Math.abs(point.y - start.y) };
      draftZoneRef.current = draft;
      setZones(current => [...current.filter(zone => zone.id !== "draft"), draft]);
      return;
    }
    if (zoneDragRef.current) {
      const drag = zoneDragRef.current;
      const point = getMapPoint(event.clientX, event.clientY);
      const dx = point.x - drag.startX;
      const dy = point.y - drag.startY;
      setZones(current => current.map(zone => {
        if (zone.id !== drag.id) return zone;
        if (drag.mode === "move") return { ...zone, x: Math.max(0, Math.min(100 - zone.width, drag.zone.x + dx)), y: Math.max(0, Math.min(100 - zone.height, drag.zone.y + dy)) };
        return { ...zone, width: Math.max(1, Math.min(100 - drag.zone.x, drag.zone.width + dx)), height: Math.max(1, Math.min(100 - drag.zone.y, drag.zone.height + dy)) };
      }));
    }
  };

  const finishMapPointer = () => {
    if (drawingRef.current) {
      const draft = draftZoneRef.current;
      drawingRef.current = null;
      draftZoneRef.current = null;
      setDrawingZone(false);
      if (draft && draft.width > 1 && draft.height > 1) {
        setZones(current => current.map(zone => zone.id === "draft" ? { ...draft, id: `area-${Date.now()}` } : zone));
        setNotice("Placement area created. Drag it to move or use its corner to resize.");
      } else {
        setZones(current => current.filter(zone => zone.id !== "draft"));
      }
    }
    zoneDragRef.current = null;
    hotspotDragRef.current = null;
    dragRef.current = null;
  };

  const startHotspotAdjust = (event: React.PointerEvent, hotspot: Hotspot, mode: "move" | "resize") => {
    if (!adminMode) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getMapPoint(event.clientX, event.clientY);
    hotspotDragRef.current = { id: hotspot.id, mode, startX: point.x, startY: point.y, hotspot: { ...hotspot } };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const startZoneAdjust = (event: React.PointerEvent, zone: Zone, mode: "move" | "resize") => {
    if (!adminMode || drawingZone) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getMapPoint(event.clientX, event.clientY);
    zoneDragRef.current = { id: zone.id, mode, startX: point.x, startY: point.y, zone: { ...zone } };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const startPan = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (
      placingHotspot || drawingZone || zoneDragRef.current ||
      (event.target as HTMLElement).closest(".hotspot-region, .placement-zone, .zone-tools-wrap, .map-legend, .admin-banner")
    ) {
      return;
    }

    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const movePan = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!dragRef.current) return;

    setPan(clampPan({
      x: dragRef.current.panX + event.clientX - dragRef.current.x,
      y: dragRef.current.panY + event.clientY - dragRef.current.y,
    }));
  };

  const zoomBy = (amount: number) => {
    setZoom(current => {
      const next = Math.max(1, Math.min(4, Number((current + amount).toFixed(2))));
      setPan(value => clampPan(value, next));
      return next;
    });
  };

  const chooseResource = (resource: Resource) => {
    setSelectedId(resource.id);
    setActiveTab("details");
  };

  const ancestors = selected
    ? getAncestors(selected.id)
    : [];

  const descendants = selected
    ? getDescendants(selected.id)
    : [];

  return (
    <main className="atlas-app">
      <header className="atlas-header">
        <div className="brand-block">
          <div className="brand-mark">G</div>

          <div>
            <div className="brand-title">
              GALACTIC PRODUCTION ATLAS
            </div>

            <div className="brand-subtitle">
              INDUSTRIAL NETWORK • RESOURCE INTELLIGENCE
            </div>
          </div>
        </div>

        <div className="header-search">
          <span className="search-symbol">⌕</span>

          <input
            aria-label="Search resources and production chains"
            value={query}
            onChange={(event) =>
              setQuery(event.target.value)
            }
            placeholder="Search materials, components, products, or chains..."
          />

          {query && (
            <button
              className="icon-button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              ×
            </button>
          )}

          {query && (
            <div className="search-results">
              <div className="search-results-heading">
                {filteredResources.length} MATCH
                {filteredResources.length === 1 ? "" : "ES"}
              </div>

              {filteredResources
                .slice(0, 12)
                .map((resource) => (
                  <button
                    className="search-result"
                    key={resource.id}
                    onClick={() => chooseResource(resource)}
                  >
                    <span
                      className={`kind-dot kind-${resource.kind
                        .toLowerCase()
                        .replace(/ /g, "-")}`}
                    />

                    <span>
                      <strong>{resource.name}</strong>
                      <small>
                        {resource.factory} · {resource.kind}
                      </small>
                    </span>

                    <span className="result-arrow">↗</span>
                  </button>
                ))}

              {filteredResources.length === 0 && (
                <div className="empty-search">
                  No matching resources found.
                </div>
              )}
            </div>
          )}
        </div>


      </header>

      <div className="atlas-layout">
        {showFactoryRail && <aside className="factory-rail">
          <div className="rail-heading">
            PRODUCTION SECTORS
          </div>

          <button
            className={`factory-link ${
              activeFactory === "All factories"
                ? "selected"
                : ""
            }`}
            onClick={() =>
              setActiveFactory("All factories")
            }
          >
            <span className="factory-icon">⌘</span>
            <span>All resources</span>
            <small>{resources.length}</small>
          </button>

          {FACTORIES.map((factory, index) => {
            const count = resources.filter(
              (resource) => resource.factory === factory
            ).length;

            return (
              <button
                key={factory}
                className={`factory-link ${
                  activeFactory === factory
                    ? "selected"
                    : ""
                }`}
                onClick={() => setActiveFactory(factory)}
                title={factory}
              >
                <span className="factory-icon">
                  {
                    [
                      "◈",
                      "◇",
                      "▦",
                      "⌁",
                      "◉",
                      "⬡",
                      "✧",
                      "▣",
                      "◌",
                    ][index]
                  }
                </span>

                <span>{factory}</span>
                <small>{count}</small>
              </button>
            );
          })}

          <div className="rail-footer">
            <div className="status-light" />
            LOCAL DATABASE
            <small>Changes saved to this browser</small>
          </div>
        </aside>}

        <section className="map-section">
          <div className="map-toolbar">
            <div>
              <div className="section-kicker">
                GALACTIC INDUSTRIAL NETWORK
              </div>

              <div className="map-title">
                {activeFactory === "All factories"
                  ? "Manufacturing Blueprint"
                  : activeFactory}
              </div>
            </div>

            <div className="map-controls">
              <button
                onClick={() => zoomBy(-0.15)}
                aria-label="Zoom out"
              >
                −
              </button>

              <span>{Math.round(zoom * 100)}%</span>

              <button
                onClick={() => zoomBy(0.15)}
                aria-label="Zoom in"
              >
                +
              </button>

              <button
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Reset map view"
              >
                RESET
              </button>
            </div>
          </div>

          {adminMode && (
            <div className="admin-banner">
              <strong>ADMIN MODE · ALT + K TO EXIT</strong>
              <span>{selected ? `Selected: ${selected.name} · add as many map locations as needed.` : "Select a resource, then add one or more hotspots."}</span>
              {selected && !placingHotspot && <button onClick={() => setPlacingHotspot(true)}>＋ ADD HOTSPOT</button>}
              {placingHotspot && <button onClick={() => setPlacingHotspot(false)}>CANCEL</button>}
            </div>
          )}

          <div
            className={`map-viewport ${placingHotspot ? "placing" : ""} ${drawingZone ? "drawing-zone" : ""}`}
            ref={viewportRef}
            onClick={handleMapClick}
            onWheel={onWheelZoom}
            onPointerDown={(event) => { beginZoneDraw(event); startPan(event); }}
            onPointerMove={(event) => { updateZonePointer(event); movePan(event); }}
            onPointerUp={finishMapPointer}
            onPointerCancel={finishMapPointer}
          >
            <div
              className="map-canvas"
              style={{
                width: `${mapSize.width}px`,
                height: `${mapSize.height}px`,
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${Math.max((viewportRef.current?.clientWidth || 1) / mapSize.width, (viewportRef.current?.clientHeight || 1) / mapSize.height) * zoom})`,
              }}
            >
              <img
                ref={imageRef}
                className="production-map-image"
                src={zoom >= 1.45 ? "/production-map-detail.png" : "/production-map.png"}
                alt="Galactic manufacturing production blueprint"
                draggable={false}
                onLoad={(event) => setMapSize({ width: event.currentTarget.naturalWidth || 1600, height: event.currentTarget.naturalHeight || 1000 })}
                onError={(event) => {
                  if (event.currentTarget.src.includes("production-map-detail.png")) {
                    event.currentTarget.src = "/production-map.png";
                  } else {
                    event.currentTarget.style.opacity = "0";
                  }
                }}
              />

              <div className="map-image-fallback">
                <div className="fallback-grid" />

                <div className="fallback-message">
                  <span>BLUEPRINT IMAGE NOT FOUND</span>
                  <strong>production-map.png</strong>
                  <small>
                    Place the blueprint image in your project's public folder.
                  </small>
                </div>

                {FACTORIES.map((factory, index) => (
                  <div
                    className="fallback-sector"
                    key={factory}
                    style={{
                      left: `${4 + (index % 3) * 32}%`,
                      top: `${
                        8 + Math.floor(index / 3) * 29
                      }%`,
                    }}
                  >
                    {factory}
                  </div>
                ))}
              </div>

              {zones.map(zone => (
                <div
                  key={zone.id}
                  className={`placement-zone ${zone.id === "draft" ? "draft" : ""} ${activeZoneId === zone.id ? "selected" : ""}`}
                  style={{ left: `${zone.x}%`, top: `${zone.y}%`, width: `${zone.width}%`, height: `${zone.height}%` }}
                  onPointerDown={event => startZoneAdjust(event, zone, "move")}
                  onClick={event => {
                    event.stopPropagation();
                    if (adminMode) return;
                    setActiveZoneId(current => current === zone.id ? null : zone.id);
                    setNotice(activeZoneId === zone.id ? "Showing all map hotspots." : `Showing ${zoneHotspotCount(zone.id)} hotspots in this area.`);
                  }}
                  title={`${zoneHotspotCount(zone.id)} hotspots · click to filter by area`}
                >
                  {zone.id !== "draft" && <span className="zone-label">AREA · {zoneHotspotCount(zone.id)}</span>}
                  {adminMode && zone.id !== "draft" && <button className="zone-delete" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setZones(current => current.filter(item => item.id !== zone.id)); }}>×</button>}
                  {adminMode && zone.id !== "draft" && <span className="zone-resize" onPointerDown={event => startZoneAdjust(event, zone, "resize")} />}
                </div>
              ))}

              {renderHotspots.map((marker) => {
                const resource = resourceById.get(marker.resourceId);
                if (!resource) return null;
                const hotspot = hotspots.find(item => item.id === marker.id);
                if (!hotspot) return null;
                return (
                  <div
                    className={`hotspot-region ${adminMode ? "editing" : ""} ${selectedId === resource.id ? "active" : ""}`}
                    key={marker.id}
                    style={{ left: `${marker.x}%`, top: `${marker.y}%`, width: `${marker.width}%`, height: `${marker.width * mapSize.width / mapSize.height}%` }}
                    onPointerDown={event => adminMode && hotspot && startHotspotAdjust(event, hotspot, "move")}
                    onClick={event => {
                      event.stopPropagation();
                      if (adminMode) return;
                      chooseResource(resource);
                    }}
                    title={adminMode ? `${resource.name} · drag to move · resize from corner` : resource.name}
                  >
                    {adminMode && <span className="hotspot-region-name">{resource.name}</span>}
                    {adminMode && hotspot && <span className="hotspot-region-resize" onPointerDown={event => startHotspotAdjust(event, hotspot, "resize")} />}
                    {adminMode && hotspot && <button className="hotspot-region-delete" onPointerDown={event => event.stopPropagation()} onClick={event => { event.stopPropagation(); setHotspots(current => current.filter(item => item.id !== hotspot.id)); }}>×</button>}
                  </div>
                );
              })}
            </div>

            {activeZoneId && !adminMode && (
              <button className="active-area-filter" onClick={() => setActiveZoneId(null)}>
                AREA FILTER ACTIVE · SHOW ALL HOTSPOTS ×
              </button>
            )}

            {adminMode && (
              <div className="zone-tools-wrap">
                <button className="zone-tools-toggle" onClick={() => setShowZoneTools(value => !value)} title="Placement area tools">▧ AREAS{zones.length ? ` · ${zones.length}` : ""}</button>
                {showZoneTools && (
                  <div className="zone-tools-panel">
                    <strong>PLACEMENT AREAS</strong>
                    <p>Areas group hotspots automatically. Click an area outside admin mode to show only its hotspots. Drag to move; use the corner to resize.</p>
                    <button onClick={() => { setDrawingZone(true); setPlacingHotspot(false); setShowZoneTools(false); }}>＋ DRAW AREA</button>
                    <button onClick={() => { setActiveZoneId(null); setZones([]); }}>CLEAR ALL AREAS</button>
                  </div>
                )}
              </div>
            )}

            <div className="map-legend">
              <span>
                <i className="legend-dot raw" /> RAW
              </span>
              <span>
                <i className="legend-dot refined" /> REFINED
              </span>
              <span>
                <i className="legend-dot component" /> COMPONENT
              </span>
              <span>
                <i className="legend-dot finished" /> FINISHED
              </span>
            </div>

            <div className="map-hint">
              DRAG TO PAN · SCROLL TO ZOOM · SELECT A HOTSPOT
            </div>
          </div>


        </section>

        {showInfoPanel && <aside className="info-panel">
          {selected ? (
            <>
              <div className="panel-topline">
                <span>RESOURCE INTELLIGENCE</span>

                <button
                  className="icon-button"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close details"
                >
                  ×
                </button>
              </div>

              <div className="resource-heading">
                <div
                  className={`resource-emblem kind-${selected.kind
                    .toLowerCase()
                    .replace(/ /g, "-")}`}
                >
                  {selected.kind === "Raw material"
                    ? "◈"
                    : selected.kind === "Refined material"
                      ? "◇"
                      : selected.kind === "Component"
                        ? "▦"
                        : "✧"}
                </div>

                <div>
                  <div className="resource-kind">
                    {selected.kind.toUpperCase()}
                  </div>

                  <h2>{selected.name}</h2>

                  <div className="resource-category">
                    {selected.category || "Uncategorized"}
                  </div>
                </div>
              </div>

              <div className="panel-tabs">
                <button
                  className={
                    activeTab === "details" ? "active" : ""
                  }
                  onClick={() => setActiveTab("details")}
                >
                  DETAILS
                </button>

                <button
                  className={
                    activeTab === "chain" ? "active" : ""
                  }
                  onClick={() => setActiveTab("chain")}
                >
                  MADE FROM
                </button>

                <button
                  className={
                    activeTab === "usedBy" ? "active" : ""
                  }
                  onClick={() => setActiveTab("usedBy")}
                >
                  USED IN
                </button>
              </div>

              {activeTab === "details" && (
                <div className="resource-details">
                  <p className="resource-description">
                    {selected.description ||
                      "No description has been added."}
                  </p>

                  <div className="detail-group">
                    <label>PRODUCTION FACILITY</label>
                    <div>
                      {selected.factory || "Not specified"}
                    </div>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-group">
                      <label>LOCATION</label>
                      <div>
                        {selected.location || "Unknown"}
                      </div>
                    </div>

                    <div className="detail-group">
                      <label>SUPPLIER</label>
                      <div>
                        {selected.supplier || "Unknown"}
                      </div>
                    </div>

                    <div className="detail-group">
                      <label>OWNER</label>
                      <div>
                        {selected.owner || "Unknown"}
                      </div>
                    </div>

                    <div className="detail-group">
                      <label>ACQUISITION</label>
                      <div>
                        {selected.acquisition ||
                          "Not specified"}
                      </div>
                    </div>
                  </div>

                  <div className="detail-group">
                    <label>NOTES</label>
                    <div>
                      {selected.notes || "No additional notes."}
                    </div>
                  </div>

                  <div className="quick-chain">
                    <div className="quick-chain-heading">
                      PRODUCTION CONNECTIONS
                    </div>

                    <div className="connection-stats">
                      <div>
                        <strong>
                          {selected.ingredients.length}
                        </strong>
                        <span>INPUTS</span>
                      </div>

                      <div>
                        <strong>{directOutputs.length}</strong>
                        <span>DIRECT OUTPUTS</span>
                      </div>

                      <div>
                        <strong>{descendants.length}</strong>
                        <span>DOWNSTREAM</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "chain" && (
                <div className="chain-panel">
                  <div className="chain-intro">
                    MATERIALS REQUIRED TO PRODUCE{" "}
                    <strong>{selected.name}</strong>
                  </div>

                  {selected.ingredients.length === 0 ? (
                    <div className="chain-empty">
                      This resource has no recorded inputs. It may be a raw material or its recipe has not been added.
                    </div>
                  ) : (
                    <div className="chain-list">
                      {selected.ingredients.map(
                        (ingredient) => {
                          const resource = resourceById.get(
                            ingredient.resourceId
                          );

                          return (
                            <button
                              className="chain-row"
                              key={ingredient.resourceId}
                              onClick={() =>
                                resource &&
                                chooseResource(resource)
                              }
                              disabled={!resource}
                            >
                              <span className="chain-quantity">
                                ×{ingredient.quantity}
                              </span>

                              <span>
                                {resource?.name ??
                                  `Missing: ${ingredient.resourceId}`}
                              </span>

                              <small>
                                {resource?.kind ??
                                  "Unknown resource"}
                              </small>

                              <b>↗</b>
                            </button>
                          );
                        }
                      )}
                    </div>
                  )}

                  {ancestors.length > 0 && (
                    <>
                      <div className="chain-subheading">
                        FULL UPSTREAM REQUIREMENTS
                      </div>

                      {ancestors.map(
                        ({ resource, depth, quantity }) => (
                          <button
                            className="chain-row nested"
                            key={resource.id}
                            onClick={() =>
                              chooseResource(resource)
                            }
                          >
                            <span className="chain-depth">
                              {depth}
                            </span>

                            <span>{resource.name}</span>
                            <small>{resource.kind}</small>
                            <b>↗</b>
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              )}

              {activeTab === "usedBy" && (
                <div className="chain-panel">
                  <div className="chain-intro">
                    PRODUCTS THAT REQUIRE{" "}
                    <strong>{selected.name}</strong>
                  </div>

                  {directOutputs.length === 0 ? (
                    <div className="chain-empty">
                      No products currently list this resource as an ingredient.
                    </div>
                  ) : (
                    directOutputs.map((resource) => (
                      <button
                        className="chain-row"
                        key={resource.id}
                        onClick={() =>
                          chooseResource(resource)
                        }
                      >
                        <span className="chain-quantity">
                          ↗
                        </span>

                        <span>{resource.name}</span>
                        <small>{resource.kind}</small>
                        <b>OPEN</b>
                      </button>
                    ))
                  )}

                  {descendants.length > 0 && (
                    <>
                      <div className="chain-subheading">
                        ALL DOWNSTREAM PRODUCTS
                      </div>

                      {descendants.map(
                        ({ resource, depth }) => (
                          <button
                            className="chain-row nested"
                            key={resource.id}
                            onClick={() =>
                              chooseResource(resource)
                            }
                          >
                            <span className="chain-depth">
                              {depth}
                            </span>

                            <span>{resource.name}</span>
                            <small>{resource.kind}</small>
                            <b>↗</b>
                          </button>
                        )
                      )}
                    </>
                  )}
                </div>
              )}

              {adminMode && (
                <div className="panel-admin-actions">
                  <button
                    onClick={() => openEditor(selected)}
                  >
                    EDIT RESOURCE
                  </button>

                  <button
                    className="danger-button"
                    onClick={() => deleteResource(selected)}
                  >
                    DELETE
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="empty-panel">
              <div className="empty-panel-icon">⌖</div>

              <div className="section-kicker">
                RESOURCE INSPECTOR
              </div>

              <h2>Select a blueprint item</h2>

              <p>
                Choose a hotspot on the manufacturing map or
                search for a resource to inspect its production
                data and connected supply chain.
              </p>

              <div className="inspector-tip">
                <strong>TIP</strong> Search for a finished
                product to trace its ingredients back to raw
                materials.
              </div>

              {adminMode && (
                <button
                  className="primary-button"
                  onClick={() => openEditor()}
                >
                  ＋ ADD RESOURCE
                </button>
              )}
            </div>
          )}

          {adminMode && (
            <div className="admin-panel">
              <div className="admin-panel-heading">
                DATABASE TOOLS
              </div>

              <button onClick={() => openEditor()}>
                ＋ CREATE RESOURCE
              </button>

              <button
                onClick={() => {
                  const blob = new Blob(
                    [JSON.stringify({ version: 2, resources, hotspots, zones }, null, 2)],
                    { type: "application/json" }
                  );

                  const url = URL.createObjectURL(blob);
                  const anchor =
                    document.createElement("a");

                  anchor.href = url;
                  anchor.download =
                    "galactic-production-atlas.json";

                  anchor.click();
                  URL.revokeObjectURL(url);
                }}
              >
                ↓ EXPORT DATABASE
              </button>

              <label className="import-button">
                ↑ IMPORT DATABASE

                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(event) => {
                    const file =
                      event.target.files?.[0];

                    if (!file) return;

                    const reader = new FileReader();

                    reader.onload = () => {
                      try {
                        const imported = JSON.parse(
                          String(reader.result)
                        );

                        if (Array.isArray(imported)) {
                          setResources(imported);
                          setHotspots(imported
                            .filter((resource: Resource) => typeof resource.x === "number" && typeof resource.y === "number")
                            .map((resource: Resource, index: number) => ({ id: `import-${resource.id}-${index}`, resourceId: resource.id, x: resource.x as number, y: resource.y as number, width: 4, height: 4, zoneId: null })));
                          setZones([]);
                        } else if (imported && Array.isArray(imported.resources)) {
                          setResources(imported.resources);
                          setHotspots(Array.isArray(imported.hotspots) ? imported.hotspots.map((item: any) => ({ ...item, width: Number(item.width) || 4, height: Number(item.height) || 4 })) : []);
                          setZones(Array.isArray(imported.zones) ? imported.zones : []);
                        } else {
                          throw new Error("Unsupported database format");
                        }
                        setActiveZoneId(null);
                        setSelectedId(null);
                        setNotice("Database, hotspots, and areas imported.");
                      } catch {
                        setNotice(
                          "Invalid database file."
                        );
                      }
                    };

                    reader.readAsText(file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </div>
          )}
        </aside>}
      </div>

      <div className="side-panel-toggles">
        <button onClick={() => setShowFactoryRail(value => !value)} title="Toggle production directory">{showFactoryRail ? "‹" : "☰"}</button>
        <button onClick={() => setShowInfoPanel(value => !value)} title="Toggle resource inspector">{showInfoPanel ? "›" : "▤"}</button>
      </div>

      {notice && (
        <div className="toast-message">{notice}</div>
      )}

      {editing && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditing(null);
            }
          }}
        >
          <form
            className="editor-modal"
            onSubmit={saveResource}
          >
            <div className="modal-header">
              <div>
                <div className="section-kicker">
                  {isCreating
                    ? "DATABASE ENTRY"
                    : "RESOURCE RECORD"}
                </div>

                <h2>
                  {isCreating
                    ? "Create resource"
                    : "Edit resource"}
                </h2>
              </div>

              <button
                type="button"
                className="icon-button"
                onClick={() => setEditing(null)}
              >
                ×
              </button>
            </div>

            <div className="editor-grid">
              <label className="editor-field full">
                <span>RESOURCE NAME *</span>

                <input
                  required
                  value={editing.name}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      name: event.target.value,
                    })
                  }
                  placeholder="e.g. Durasteel"
                />
              </label>

              <label className="editor-field">
                <span>CATEGORY</span>

                <input
                  value={editing.category}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      category: event.target.value,
                    })
                  }
                  placeholder="e.g. Metal, Ore, Weapon"
                />
              </label>

              <label className="editor-field">
                <span>RESOURCE TYPE</span>

                <select
                  value={editing.kind}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      kind: event.target.value as Kind,
                    })
                  }
                >
                  {KINDS.map((kind) => (
                    <option key={kind}>{kind}</option>
                  ))}
                </select>
              </label>

              <label className="editor-field full">
                <span>PRODUCTION FACILITY</span>

                <select
                  value={editing.factory}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      factory: event.target.value,
                    })
                  }
                >
                  {FACTORIES.map((factory) => (
                    <option key={factory}>{factory}</option>
                  ))}
                </select>
              </label>

              <label className="editor-field full">
                <span>DESCRIPTION</span>

                <textarea
                  rows={3}
                  value={editing.description}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      description: event.target.value,
                    })
                  }
                />
              </label>

              <label className="editor-field full">
                <span>
                  INGREDIENTS (one per line: resource-id:quantity)
                </span>

                <textarea
                  rows={4}
                  value={ingredientText}
                  onChange={(event) =>
                    setIngredientText(event.target.value)
                  }
                  placeholder={
                    "example-ore:2\nexample-metal:3"
                  }
                />

                <small>
                  Use the resource ID shown below. Ingredients
                  must already exist in the database.
                </small>
              </label>

              <label className="editor-field">
                <span>LOCATION</span>

                <input
                  value={editing.location}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      location: event.target.value,
                    })
                  }
                />
              </label>

              <label className="editor-field">
                <span>SUPPLIER</span>

                <input
                  value={editing.supplier}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      supplier: event.target.value,
                    })
                  }
                />
              </label>

              <label className="editor-field">
                <span>OWNER</span>

                <input
                  value={editing.owner}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      owner: event.target.value,
                    })
                  }
                />
              </label>

              <label className="editor-field">
                <span>ACQUISITION</span>

                <input
                  value={editing.acquisition}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      acquisition: event.target.value,
                    })
                  }
                />
              </label>

              <label className="editor-field full">
                <span>NOTES</span>

                <textarea
                  rows={2}
                  value={editing.notes}
                  onChange={(event) =>
                    setEditing({
                      ...editing,
                      notes: event.target.value,
                    })
                  }
                />
              </label>

              {!isCreating && (
                <div className="resource-id-field">
                  RESOURCE ID: <code>{editing.id}</code>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEditing(null)}
              >
                CANCEL
              </button>

              <button
                type="submit"
                className="primary-button"
              >
                SAVE RESOURCE
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default App;
