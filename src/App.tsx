import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1000;

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

function App() {
  const [resources, setResources] =
    useState<Resource[]>(readSavedResources);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFactory, setActiveFactory] =
    useState("All factories");

  const [activeTab, setActiveTab] =
    useState<"details" | "chain" | "usedBy">("details");

  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [adminMode, setAdminMode] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [ingredientText, setIngredientText] = useState("");

  const [zoom, setZoom] = useState(0.8);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const [placingHotspot, setPlacingHotspot] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [notice, setNotice] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const dragRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
    } catch {
      setNotice("Could not save changes in this browser.");
    }
  }, [resources]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => searchRef.current?.focus(), 0);
      }

      if (event.key === "Escape") {
        setSearchOpen(false);
        setQuery("");
        setEditing(null);
        setPlacingHotspot(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const resourceById = useMemo(
    () =>
      new Map(
        resources.map((resource) => [resource.id, resource])
      ),
    [resources]
  );

  const selected = selectedId
    ? resourceById.get(selectedId) ?? null
    : null;

  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) return [];

    return resources
      .map((resource) => {
        const ingredientNames = resource.ingredients
          .map(
            (ingredient) =>
              resourceById.get(ingredient.resourceId)?.name ?? ""
          )
          .join(" ");

        const usedBy = resources
          .filter((candidate) =>
            candidate.ingredients.some(
              (ingredient) => ingredient.resourceId === resource.id
            )
          )
          .map((candidate) => candidate.name)
          .join(" ");

        const searchable = [
          resource.name,
          resource.id,
          resource.category,
          resource.kind,
          resource.factory,
          resource.description,
          resource.location,
          resource.supplier,
          resource.owner,
          resource.acquisition,
          resource.notes,
          ingredientNames,
          usedBy,
        ]
          .join(" ")
          .toLowerCase();

        return searchable.includes(term) ? resource : null;
      })
      .filter((resource): resource is Resource => resource !== null)
      .slice(0, 30);
  }, [query, resources, resourceById]);

  const visibleResources = useMemo(
    () =>
      resources.filter(
        (resource) =>
          activeFactory === "All factories" ||
          resource.factory === activeFactory
      ),
    [resources, activeFactory]
  );

  const directOutputs = useMemo(
    () =>
      selected
        ? resources.filter((resource) =>
            resource.ingredients.some(
              (ingredient) => ingredient.resourceId === selected.id
            )
          )
        : [],
    [resources, selected]
  );

  const getAncestors = useCallback(
    (resourceId: string) => {
      const result: Array<{
        resource: Resource;
        depth: number;
        quantity: number;
      }> = [];

      const visited = new Set<string>();

      const walk = (
        id: string,
        depth: number,
        multiplier: number,
        path: Set<string>
      ) => {
        const resource = resourceById.get(id);
        if (!resource) return;

        resource.ingredients.forEach((ingredient) => {
          const child = resourceById.get(ingredient.resourceId);

          if (!child || path.has(child.id)) return;

          const quantity = multiplier * ingredient.quantity;

          if (!visited.has(child.id)) {
            visited.add(child.id);
            result.push({
              resource: child,
              depth: depth + 1,
              quantity,
            });
          }

          const nextPath = new Set(path);
          nextPath.add(child.id);
          walk(child.id, depth + 1, quantity, nextPath);
        });
      };

      walk(resourceId, 0, 1, new Set([resourceId]));
      return result;
    },
    [resourceById]
  );

  const getDescendants = useCallback(
    (resourceId: string) => {
      const result: Array<{
        resource: Resource;
        depth: number;
      }> = [];

      const visited = new Set<string>();

      const walk = (id: string, depth: number) => {
        resources.forEach((candidate) => {
          const usesResource = candidate.ingredients.some(
            (ingredient) => ingredient.resourceId === id
          );

          if (usesResource && !visited.has(candidate.id)) {
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

  const ancestors = selected ? getAncestors(selected.id) : [];
  const descendants = selected ? getDescendants(selected.id) : [];

  const chooseResource = (resource: Resource) => {
    setSelectedId(resource.id);
    setInspectorOpen(true);
    setActiveTab("details");
    setSearchOpen(false);
    setQuery("");
  };

  const openEditor = (resource?: Resource) => {
    const value = resource ? { ...resource } : emptyResource();

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

  const saveResource = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!editing || !editing.name.trim()) return;

    const newId = editing.id || makeId(editing.name);

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
          quantity: Math.max(0.001, Number(rawQuantity) || 1),
        };
      })
      .filter(
        (ingredient) =>
          ingredient.resourceId !== newId &&
          resources.some(
            (resource) => resource.id === ingredient.resourceId
          )
      );

    const saved: Resource = {
      ...editing,
      id: newId,
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
    setInspectorOpen(true);
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
            (ingredient) => ingredient.resourceId !== resource.id
          ),
        }))
    );

    setSelectedId(null);
    setNotice("Resource deleted.");
  };

  const startPan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (
      placingHotspot ||
      (event.target as HTMLElement).closest(".hotspot")
    ) {
      return;
    }

    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const movePan = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;

    const dx = event.clientX - dragRef.current.x;
    const dy = event.clientY - dragRef.current.y;

    if (Math.abs(dx) + Math.abs(dy) > 3) {
      dragRef.current.moved = true;
    }

    setPan({
      x: dragRef.current.panX + dx,
      y: dragRef.current.panY + dy,
    });
  };

  const stopPan = () => {
    dragRef.current = null;
  };

  const zoomBy = (amount: number) => {
    setZoom((current) =>
      Math.min(3, Math.max(0.25, Number((current + amount).toFixed(2))))
    );
  };

  const resetMap = () => {
    setZoom(0.8);
    setPan({ x: 0, y: 0 });
  };

  const handleMapClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!placingHotspot || !selected || !viewportRef.current) return;

    const bounds = viewportRef.current.getBoundingClientRect();

    const localX =
      (event.clientX - bounds.left - bounds.width / 2 - pan.x) / zoom +
      MAP_WIDTH / 2;

    const localY =
      (event.clientY - bounds.top - bounds.height / 2 - pan.y) / zoom +
      MAP_HEIGHT / 2;

    const x = Math.max(0, Math.min(100, (localX / MAP_WIDTH) * 100));
    const y = Math.max(0, Math.min(100, (localY / MAP_HEIGHT) * 100));

    setResources((current) =>
      current.map((resource) =>
        resource.id === selected.id
          ? { ...resource, x, y }
          : resource
      )
    );

    setPlacingHotspot(false);
    setNotice(`Map location set for ${selected.name}.`);
  };

  const exportDatabase = () => {
    const blob = new Blob(
      [JSON.stringify(resources, null, 2)],
      { type: "application/json" }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = "galactic-production-atlas.json";
    anchor.click();

    URL.revokeObjectURL(url);
  };

  const importDatabase = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));

        if (!Array.isArray(imported)) {
          throw new Error("Expected an array");
        }

        setResources(imported);
        setSelectedId(null);
        setNotice("Database imported.");
      } catch {
        setNotice("Invalid database file.");
      }
    };

    reader.readAsText(file);
  };

  return (
    <main className="atlas-app">
      <div
        className={`map-viewport ${placingHotspot ? "placing" : ""}`}
        ref={viewportRef}
        onClick={handleMapClick}
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
        onWheel={(event) => {
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault();
            zoomBy(event.deltaY < 0 ? 0.08 : -0.08);
          }
        }}
      >
        <div
          className="map-canvas"
          style={{
            transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${zoom})`,
          }}
        >
          <img
            className="production-map-image"
            src="/production-map.png"
            alt="Galactic manufacturing blueprint"
            draggable={false}
            onLoad={() => {
              setMapLoaded(true);
              setMapFailed(false);
            }}
            onError={() => {
              setMapFailed(true);
              setMapLoaded(false);
            }}
          />

          {mapFailed && (
            <div className="map-image-fallback">
              <div className="fallback-grid" />
              <div className="fallback-message">
                <span>BLUEPRINT IMAGE NOT FOUND</span>
                <strong>production-map.png</strong>
                <small>
                  Add your blueprint image to the project's public folder.
                </small>
              </div>
            </div>
          )}

          {visibleResources
            .filter(
              (resource) =>
                typeof resource.x === "number" &&
                typeof resource.y === "number"
            )
            .map((resource) => (
              <button
                key={resource.id}
                className={`hotspot kind-${resource.kind
                  .toLowerCase()
                  .replace(/ /g, "-")} ${
                  selectedId === resource.id ? "active" : ""
                }`}
                style={{
                  left: `${resource.x}%`,
                  top: `${resource.y}%`,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  chooseResource(resource);
                }}
                title={resource.name}
              >
                <span className="hotspot-pulse" />
                <span className="hotspot-label">{resource.name}</span>
              </button>
            ))}
        </div>
      </div>

      <header className="floating-header">
        <button
          className="brand-block"
          onClick={() => {
            setDirectoryOpen(false);
            setInspectorOpen(false);
            setActiveFactory("All factories");
          }}
          title="Show the full blueprint"
        >
          <span className="brand-mark">G</span>
          <span className="brand-copy">
            <strong>GALACTIC PRODUCTION ATLAS</strong>
            <small>INDUSTRIAL NETWORK • RESOURCE INTELLIGENCE</small>
          </span>
        </button>

        <div className="header-search">
          <span className="search-symbol">⌕</span>
          <input
            ref={searchRef}
            value={query}
            onFocus={() => setSearchOpen(true)}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && searchResults[0]) {
                chooseResource(searchResults[0]);
              }
            }}
            placeholder="Search resources, materials, factories, production chains..."
            aria-label="Search the production database"
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

          {searchOpen && query.trim() && (
            <div className="search-results">
              <div className="search-results-heading">
                {searchResults.length} MATCH
                {searchResults.length === 1 ? "" : "ES"}
              </div>

              {searchResults.length === 0 ? (
                <div className="empty-search">
                  No matching resources found.
                  <small>
                    Try a material name, factory, ingredient, or finished product.
                  </small>
                </div>
              ) : (
                searchResults.map((resource) => (
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
                    <span className="search-result-copy">
                      <strong>{resource.name}</strong>
                      <small>
                        {resource.kind} · {resource.factory}
                      </small>
                    </span>
                    <span className="result-arrow">↗</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="top-actions">
          <span className="resource-count">{resources.length} INDEXED</span>
          <button
            className={`admin-toggle ${adminMode ? "active" : ""}`}
            onClick={() => {
              setAdminMode((value) => !value);
              setPlacingHotspot(false);
            }}
          >
            {adminMode ? "ADMIN ON" : "ADMIN"}
          </button>
        </div>
      </header>

      <div className="floating-controls">
        <button
          className={directoryOpen ? "control-active" : ""}
          onClick={() => setDirectoryOpen((value) => !value)}
          title="Toggle production directory"
        >
          <span>☷</span>
          <small>DIRECTORY</small>
        </button>

        <button
          className={inspectorOpen ? "control-active" : ""}
          onClick={() => setInspectorOpen((value) => !value)}
          title="Toggle resource inspector"
        >
          <span>⌖</span>
          <small>INSPECTOR</small>
        </button>
      </div>

      <div className="map-tools">
        <button onClick={() => zoomBy(0.15)} title="Zoom in">＋</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button onClick={() => zoomBy(-0.15)} title="Zoom out">−</button>
        <button onClick={resetMap} title="Reset map">RESET</button>
      </div>

      {directoryOpen && (
        <aside className="floating-panel directory-panel">
          <div className="panel-topline">
            <div>
              <span className="section-kicker">DATABASE INDEX</span>
              <h2>Production sectors</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setDirectoryOpen(false)}
              aria-label="Collapse directory"
            >
              ×
            </button>
          </div>

          <button
            className={`factory-link ${
              activeFactory === "All factories" ? "selected" : ""
            }`}
            onClick={() => setActiveFactory("All factories")}
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
                  activeFactory === factory ? "selected" : ""
                }`}
                onClick={() => setActiveFactory(factory)}
              >
                <span className="factory-icon">
                  {["◈", "◇", "▦", "⌁", "◉", "⬡", "✧", "▣", "◌"][index]}
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
        </aside>
      )}

      {inspectorOpen && (
        <aside className="floating-panel inspector-panel">
          <div className="panel-topline">
            <div>
              <span className="section-kicker">RESOURCE INTELLIGENCE</span>
              <h2>Inspector</h2>
            </div>
            <button
              className="icon-button"
              onClick={() => setInspectorOpen(false)}
              aria-label="Collapse inspector"
            >
              ×
            </button>
          </div>

          {selected ? (
            <>
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
                  className={activeTab === "details" ? "active" : ""}
                  onClick={() => setActiveTab("details")}
                >
                  DETAILS
                </button>
                <button
                  className={activeTab === "chain" ? "active" : ""}
                  onClick={() => setActiveTab("chain")}
                >
                  MADE FROM
                </button>
                <button
                  className={activeTab === "usedBy" ? "active" : ""}
                  onClick={() => setActiveTab("usedBy")}
                >
                  USED IN
                </button>
              </div>

              {activeTab === "details" && (
                <div className="resource-details">
                  <p className="resource-description">
                    {selected.description || "No description has been added."}
                  </p>

                  <div className="detail-group">
                    <label>PRODUCTION FACILITY</label>
                    <div>{selected.factory || "Not specified"}</div>
                  </div>

                  <div className="detail-grid">
                    <div className="detail-group">
                      <label>LOCATION</label>
                      <div>{selected.location || "Unknown"}</div>
                    </div>
                    <div className="detail-group">
                      <label>SUPPLIER</label>
                      <div>{selected.supplier || "Unknown"}</div>
                    </div>
                    <div className="detail-group">
                      <label>OWNER</label>
                      <div>{selected.owner || "Unknown"}</div>
                    </div>
                    <div className="detail-group">
                      <label>ACQUISITION</label>
                      <div>{selected.acquisition || "Not specified"}</div>
                    </div>
                  </div>

                  <div className="detail-group">
                    <label>NOTES</label>
                    <div>{selected.notes || "No additional notes."}</div>
                  </div>

                  <div className="quick-chain">
                    <div className="quick-chain-heading">
                      PRODUCTION CONNECTIONS
                    </div>
                    <div className="connection-stats">
                      <div>
                        <strong>{selected.ingredients.length}</strong>
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
                      No ingredients are recorded for this resource.
                    </div>
                  ) : (
                    selected.ingredients.map((ingredient) => {
                      const resource = resourceById.get(ingredient.resourceId);

                      return (
                        <button
                          className="chain-row"
                          key={ingredient.resourceId}
                          disabled={!resource}
                          onClick={() => resource && chooseResource(resource)}
                        >
                          <span className="chain-quantity">
                            ×{ingredient.quantity}
                          </span>
                          <span>
                            {resource?.name ?? `Missing: ${ingredient.resourceId}`}
                          </span>
                          <small>{resource?.kind ?? "Unknown"}</small>
                          <b>↗</b>
                        </button>
                      );
                    })
                  )}

                  {ancestors.length > 0 && (
                    <>
                      <div className="chain-subheading">
                        FULL UPSTREAM REQUIREMENTS
                      </div>
                      {ancestors.map(({ resource, depth, quantity }) => (
                        <button
                          className="chain-row nested"
                          key={resource.id}
                          onClick={() => chooseResource(resource)}
                        >
                          <span className="chain-depth">{depth}</span>
                          <span>{resource.name}</span>
                          <small>×{quantity} · {resource.kind}</small>
                          <b>↗</b>
                        </button>
                      ))}
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
                        onClick={() => chooseResource(resource)}
                      >
                        <span className="chain-quantity">↗</span>
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
                      {descendants.map(({ resource, depth }) => (
                        <button
                          className="chain-row nested"
                          key={resource.id}
                          onClick={() => chooseResource(resource)}
                        >
                          <span className="chain-depth">{depth}</span>
                          <span>{resource.name}</span>
                          <small>{resource.kind}</small>
                          <b>↗</b>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}

              {adminMode && (
                <div className="panel-admin-actions">
                  <button onClick={() => openEditor(selected)}>
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
              <h2>Select a blueprint item</h2>
              <p>
                Click a map marker or search for a resource to inspect its
                production data and connected supply chain.
              </p>
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
        </aside>
      )}

      {adminMode && (
        <div className="admin-dock">
          <span className="admin-label">ADMIN MODE</span>

          {selected ? (
            <>
              <span className="admin-selected">
                Selected: {selected.name}
              </span>
              <button
                onClick={() => {
                  setPlacingHotspot(true);
                  setInspectorOpen(false);
                }}
              >
                PLACE ON MAP
              </button>
            </>
          ) : (
            <span className="admin-selected">
              Select a resource to place its map marker.
            </span>
          )}

          {placingHotspot && (
            <button
              className="danger-button"
              onClick={() => setPlacingHotspot(false)}
            >
              CANCEL PLACEMENT
            </button>
          )}

          <button onClick={() => openEditor()}>＋ NEW RESOURCE</button>
          <button onClick={exportDatabase}>↓ EXPORT</button>
          <label className="import-button">
            ↑ IMPORT
            <input
              type="file"
              accept="application/json,.json"
              onChange={importDatabase}
            />
          </label>
        </div>
      )}

      <div className="map-status">
        <span>
          {visibleResources.length} RESOURCES
          {activeFactory !== "All factories" ? ` · ${activeFactory}` : ""}
        </span>
        <span>
          {mapLoaded
            ? "BLUEPRINT LOADED"
            : mapFailed
              ? "BLUEPRINT MISSING"
              : "LOADING BLUEPRINT"}
        </span>
        <span>DRAG TO PAN · CTRL + SCROLL TO ZOOM</span>
      </div>

      {notice && <div className="toast-message">{notice}</div>}

      {editing && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditing(null);
            }
          }}
        >
          <form className="editor-modal" onSubmit={saveResource}>
            <div className="modal-header">
              <div>
                <div className="section-kicker">
                  {isCreating ? "DATABASE ENTRY" : "RESOURCE RECORD"}
                </div>
                <h2>{isCreating ? "Create resource" : "Edit resource"}</h2>
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
                    setEditing({ ...editing, name: event.target.value })
                  }
                  placeholder="e.g. Durasteel"
                />
              </label>

              <label className="editor-field">
                <span>CATEGORY</span>
                <input
                  value={editing.category}
                  onChange={(event) =>
                    setEditing({ ...editing, category: event.target.value })
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
                    setEditing({ ...editing, factory: event.target.value })
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
                <span>INGREDIENTS (one per line: resource-id:quantity)</span>
                <textarea
                  rows={4}
                  value={ingredientText}
                  onChange={(event) => setIngredientText(event.target.value)}
                  placeholder={"example-ore:2\nexample-metal:3"}
                />
                <small>
                  Ingredients must already exist in the database. Use their
                  resource IDs.
                </small>
              </label>

              <label className="editor-field">
                <span>LOCATION</span>
                <input
                  value={editing.location}
                  onChange={(event) =>
                    setEditing({ ...editing, location: event.target.value })
                  }
                />
              </label>

              <label className="editor-field">
                <span>SUPPLIER</span>
                <input
                  value={editing.supplier}
                  onChange={(event) =>
                    setEditing({ ...editing, supplier: event.target.value })
                  }
                />
              </label>

              <label className="editor-field">
                <span>OWNER</span>
                <input
                  value={editing.owner}
                  onChange={(event) =>
                    setEditing({ ...editing, owner: event.target.value })
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
                    setEditing({ ...editing, notes: event.target.value })
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
              <button type="submit" className="primary-button">
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
