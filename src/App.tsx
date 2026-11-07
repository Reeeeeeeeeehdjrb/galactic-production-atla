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
  const [notice, setNotice] = useState("");

  const viewportRef = useRef<HTMLDivElement>(null);

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

    setSelectedId(null);
    setNotice("Resource deleted.");
  };

  // In admin mode, click the blueprint to place the selected resource.
  const handleMapClick = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (
      !placingHotspot ||
      !selected ||
      !viewportRef.current
    ) {
      return;
    }

    const bounds =
      viewportRef.current.getBoundingClientRect();

    const x = Math.max(
      0,
      Math.min(
        100,
        ((event.clientX - bounds.left) / bounds.width) *
          100
      )
    );

    const y = Math.max(
      0,
      Math.min(
        100,
        ((event.clientY - bounds.top) / bounds.height) *
          100
      )
    );

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

  const startPan = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
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
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const movePan = (
    event: React.PointerEvent<HTMLDivElement>
  ) => {
    if (!dragRef.current) return;

    setPan({
      x:
        dragRef.current.panX +
        event.clientX -
        dragRef.current.x,

      y:
        dragRef.current.panY +
        event.clientY -
        dragRef.current.y,
    });
  };

  const stopPan = () => {
    dragRef.current = null;
  };

  const zoomBy = (amount: number) => {
    setZoom((current) =>
      Math.min(
        2.8,
        Math.max(
          0.55,
          Number((current + amount).toFixed(2))
        )
      )
    );
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

        <div className="top-actions">
          <span className="resource-count">
            {resources.length} INDEXED
          </span>

          <button
            className={`admin-toggle ${
              adminMode ? "active" : ""
            }`}
            onClick={() => {
              setAdminMode((value) => !value);
              setPlacingHotspot(false);
            }}
          >
            {adminMode ? "ADMIN ON" : "ADMIN"}
          </button>
        </div>
      </header>

      <div className="atlas-layout">
        <aside className="factory-rail">
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
        </aside>

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
              <strong>ADMIN MODE</strong>

              {selected
                ? placingHotspot
                  ? `Click the blueprint where "${selected.name}" belongs.`
                  : `Selected: ${selected.name}. Choose "Place on map" to position its hotspot.`
                : "Select a resource or create one to manage blueprint hotspots and data."}

              {selected && !placingHotspot && (
                <button
                  onClick={() => setPlacingHotspot(true)}
                >
                  PLACE ON MAP
                </button>
              )}

              {placingHotspot && (
                <button
                  onClick={() => setPlacingHotspot(false)}
                >
                  CANCEL
                </button>
              )}
            </div>
          )}

          <div
            className={`map-viewport ${
              placingHotspot ? "placing" : ""
            }`}
            ref={viewportRef}
            onClick={handleMapClick}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={stopPan}
            onPointerCancel={stopPan}
          >
            <div
              className="map-canvas"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              <img
                className="production-map-image"
                src="/production-map.png"
                alt="Galactic manufacturing production blueprint"
                draggable={false}
                onError={(event) => {
                  event.currentTarget.style.opacity = "0";
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

              {resources
                .filter(
                  (resource) =>
                    typeof resource.x === "number" &&
                    typeof resource.y === "number"
                )
                .filter(
                  (resource) =>
                    activeFactory === "All factories" ||
                    resource.factory === activeFactory
                )
                .map((resource) => (
                  <button
                    key={resource.id}
                    className={`hotspot ${
                      selectedId === resource.id
                        ? "active"
                        : ""
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
                    <span className="hotspot-label">
                      {resource.name}
                    </span>
                  </button>
                ))}
            </div>

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
              DRAG TO PAN · USE + / − TO ZOOM · SELECT A HOTSPOT
            </div>
          </div>

          <div className="map-bottom-bar">
            <span>
              {filteredResources.length} RESOURCES IN VIEW
            </span>

            <span>
              BLUEPRINT COORDINATES USE NORMALIZED IMAGE POSITIONS
            </span>
          </div>
        </section>

        <aside className="info-panel">
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
                    [JSON.stringify(resources, null, 2)],
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

                        if (!Array.isArray(imported)) {
                          throw new Error(
                            "Expected an array"
                          );
                        }

                        setResources(imported);
                        setSelectedId(null);
                        setNotice("Database imported.");
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
        </aside>
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
