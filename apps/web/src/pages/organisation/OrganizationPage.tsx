import {
    useMemo,
    useState,
    type ChangeEvent,
    type FormEvent,
  } from "react";
  import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
  import {
    Building2,
    ChevronDown,
    ChevronRight,
    CircleAlert,
    FolderTree,
    LoaderCircle,
    Pencil,
    Plus,
    RefreshCw,
    Settings2,
    ToggleLeft,
    ToggleRight,
    Trash2,
    UsersRound,
    X,
  } from "lucide-react";
  import { getApiErrorMessage } from "../../features/auth/auth.api";
  import { useAuth } from "../../features/auth/auth.context";
  import {
    createOrganizationUnit,
    deleteOrganizationUnit,
    getOrganizationTree,
    updateOrganizationUnit,
  } from "../../features/organisation/organisation.api";
  import type {
    CreateOrganizationUnitInput,
    OrganizationTreeDirection,
    OrganizationUnit,
    OrganizationUnitStatus,
    OrganizationUnitType,
  } from "../../features/organisation/organisation.types";
  import "./organization-page.css";
  
  type UnitModalMode = "CREATE_DIRECTION" | "CREATE_SERVICE" | "EDIT";
  
  type UnitFormState = {
    name: string;
    code: string;
    type: OrganizationUnitType;
    parentId: string;
    description: string;
    status: OrganizationUnitStatus;
    sortOrder: string;
  };
  
  const initialFormState: UnitFormState = {
    name: "",
    code: "",
    type: "DIRECTION",
    parentId: "",
    description: "",
    status: "ACTIVE",
    sortOrder: "0",
  };
  
  function getUnitStatusLabel(status: OrganizationUnitStatus): string {
    return status === "ACTIVE" ? "Actif" : "Inactif";
  }
  
  function getUnitInitials(name: string): string {
    const initials = name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((item) => item.charAt(0).toUpperCase())
      .join("");
  
    return initials || "F";
  }
  
  function sortDirections(
    directions: OrganizationTreeDirection[],
  ): OrganizationTreeDirection[] {
    return [...directions].sort((first, second) => {
      if (first.sortOrder !== second.sortOrder) {
        return first.sortOrder - second.sortOrder;
      }
  
      return first.name.localeCompare(second.name, "fr");
    });
  }
  
  export default function OrganizationPage() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
  
    const [expandedDirections, setExpandedDirections] = useState<string[]>(
      [],
    );
  
    const [modalMode, setModalMode] = useState<UnitModalMode | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<OrganizationUnit | null>(
      null,
    );
  
    const [formState, setFormState] =
      useState<UnitFormState>(initialFormState);
  
    const organizationQuery = useQuery({
      queryKey: ["organization-tree"],
      queryFn: getOrganizationTree,
      staleTime: 1000 * 30,
    });
  
    const directions = useMemo(
      () => sortDirections(organizationQuery.data ?? []),
      [organizationQuery.data],
    );
  
    const canManageOrganization = user?.role === "TENANT_ADMIN";

  const canDeleteOrganization =
    user?.role === "TENANT_ADMIN" || user?.role === "RH_MANAGER";
  
    const createMutation = useMutation({
      mutationFn: createOrganizationUnit,
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["organization-tree"],
        });
  
        closeModal();
      },
    });
  
    const updateMutation = useMutation({
      mutationFn: ({
        unitId,
        input,
      }: {
        unitId: string;
        input: Parameters<typeof updateOrganizationUnit>[1];
      }) => updateOrganizationUnit(unitId, input),
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: ["organization-tree"],
        });
  
        closeModal();
      },
    });
  

    const deleteMutation = useMutation({
      mutationFn: deleteOrganizationUnit,
      onSuccess: async (_, deletedUnitId) => {
        await queryClient.invalidateQueries({
          queryKey: ["organization-tree"],
        });

        setExpandedDirections((currentValue) =>
          currentValue.filter((id) => id !== deletedUnitId),
        );
      },
    });

    function closeModal(): void {
      setModalMode(null);
      setSelectedUnit(null);
      setFormState(initialFormState);
    }
  
    function openCreateDirectionModal(): void {
      setSelectedUnit(null);
      setFormState({
        ...initialFormState,
        type: "DIRECTION",
      });
  
      setModalMode("CREATE_DIRECTION");
    }
  
    function openCreateServiceModal(directionId?: string): void {
      setSelectedUnit(null);
  
      setFormState({
        ...initialFormState,
        type: "SERVICE",
        parentId: directionId ?? directions[0]?.id ?? "",
      });
  
      setModalMode("CREATE_SERVICE");
    }
  
    function openEditModal(unit: OrganizationUnit): void {
      setSelectedUnit(unit);
  
      setFormState({
        name: unit.name,
        code: unit.code,
        type: unit.type,
        parentId: unit.parentId ?? "",
        description: unit.description ?? "",
        status: unit.status,
        sortOrder: String(unit.sortOrder),
      });
  
      setModalMode("EDIT");
    }
  
    function toggleDirection(directionId: string): void {
      setExpandedDirections((currentValue) =>
        currentValue.includes(directionId)
          ? currentValue.filter((id) => id !== directionId)
          : [...currentValue, directionId],
      );
    }
  
    function handleFormChange(
      event: ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ): void {
      const { name, value } = event.target;
  
      setFormState((currentValue) => ({
        ...currentValue,
        [name]: value,
      }));
    }
  
    async function handleSubmit(
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
  
      const input: CreateOrganizationUnitInput = {
        name: formState.name.trim(),
        code: formState.code.trim().toUpperCase(),
        type: formState.type,
        parentId:
          formState.type === "SERVICE" ? formState.parentId || null : null,
        description: formState.description.trim() || undefined,
        status: formState.status,
        sortOrder: Number(formState.sortOrder || "0"),
      };
  
      try {
        if (modalMode === "EDIT" && selectedUnit) {
          await updateMutation.mutateAsync({
            unitId: selectedUnit.id,
            input: {
              name: input.name,
              code: input.code,
              description: input.description,
              status: input.status,
              sortOrder: input.sortOrder,
            },
          });
  
          return;
        }
  
        await createMutation.mutateAsync(input);
      } catch {
        // L'erreur est affichée dans la modale.
      }
    }
  
    async function toggleUnitStatus(unit: OrganizationUnit): Promise<void> {
      try {
        await updateMutation.mutateAsync({
          unitId: unit.id,
          input: {
            status: unit.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
          },
        });
      } catch {
        // L'erreur est affichée dans la zone de la page.
      }
    }

  async function deleteUnit(unit: OrganizationUnit): Promise<void> {
    if (!canDeleteOrganization) {
      return;
    }

    const message =
      unit.type === "DIRECTION"
        ? `Confirmez-vous la suppression définitive de la Direction « ${unit.name} » et de tous les Services qui y sont rattachés ? Cette action est réservée à l’Administrateur et au RH.`
        : `Confirmez-vous la suppression définitive du Service « ${unit.name} » ? Cette action est réservée à l’Administrateur et au RH.`;

    const confirmed = window.confirm(message);

    if (!confirmed) {
      return;
    }

    try {
      await deleteMutation.mutateAsync(unit.id);
    } catch {
      // L'erreur est affichée dans la zone de la page.
    }
  }
  
    const activeDirections = directions.filter(
      (direction) => direction.status === "ACTIVE",
    ).length;
  
    const totalServices = directions.reduce(
      (total, direction) => total + direction.services.length,
      0,
    );
  
    const totalActiveServices = directions.reduce(
      (total, direction) =>
        total +
        direction.services.filter((service) => service.status === "ACTIVE")
          .length,
      0,
    );
  
    const mutationError = createMutation.isError
      ? getApiErrorMessage(createMutation.error)
      : updateMutation.isError
        ? getApiErrorMessage(updateMutation.error)
        : deleteMutation.isError
          ? getApiErrorMessage(deleteMutation.error)
          : null;
  
    const isSubmitting =
      createMutation.isPending ||
      updateMutation.isPending ||
      deleteMutation.isPending;
  
    return (
      <section className="organization-page">
        <header className="organization-hero">
          <div>
            <p className="organization-eyebrow">
              STRUCTURE ORGANISATIONNELLE
            </p>
  
            <h2>
              Directions et <span>Services.</span>
            </h2>
  
            <p>
              Organisez la structure interne avant de rattacher les
              agents, les tâches, les pointages et les cahiers de route.
            </p>
          </div>
  
          <div className="organization-hero-actions">
            <button
              className="organization-secondary-button"
              type="button"
              onClick={() => void organizationQuery.refetch()}
              disabled={organizationQuery.isFetching}
            >
              <RefreshCw
                size={18}
                className={organizationQuery.isFetching ? "is-spinning" : ""}
              />
  
              <span>
                {organizationQuery.isFetching
                  ? "Actualisation..."
                  : "Actualiser"}
              </span>
            </button>
  
            {canManageOrganization && (
              <button
                className="organization-primary-button"
                type="button"
                onClick={openCreateDirectionModal}
              >
                <Plus size={18} />
                <span>Nouvelle Direction</span>
              </button>
            )}
          </div>
        </header>
  
        {organizationQuery.isError && (
          <div className="organization-alert">
            <CircleAlert size={21} />
  
            <div>
              <strong>Impossible de charger votre structure.</strong>
              <p>
                Vérifie que le backend est démarré et que ta session est toujours
                active.
              </p>
            </div>
          </div>
        )}

        {deleteMutation.isError && (
          <div className="organization-alert">
            <CircleAlert size={21} />

            <div>
              <strong>Suppression impossible.</strong>
              <p>{getApiErrorMessage(deleteMutation.error)}</p>
            </div>
          </div>
        )}

        <section className="organization-metrics-grid">
          <article className="organization-metric-card">
            <span className="organization-metric-icon direction">
              <Building2 size={21} />
            </span>
  
            <div>
              <span>Directions</span>
              <strong>{directions.length}</strong>
              <p>{activeDirections} actives</p>
            </div>
          </article>
  
          <article className="organization-metric-card">
            <span className="organization-metric-icon service">
              <FolderTree size={21} />
            </span>
  
            <div>
              <span>Services</span>
              <strong>{totalServices}</strong>
              <p>{totalActiveServices} actifs</p>
            </div>
          </article>
  
          <article className="organization-metric-card">
            <span className="organization-metric-icon setup">
              <Settings2 size={21} />
            </span>
  
            <div>
              <span>État du module</span>
              <strong>Prêt</strong>
              <p>Base organisationnelle active</p>
            </div>
          </article>
        </section>
  
        <section className="organization-content-grid">
          <article className="organization-tree-panel">
            <div className="organization-panel-heading">
              <div>
                <p>ARBORESCENCE</p>
                <h3>Structure </h3>
              </div>
  
              <span className="organization-panel-chip">
                {directions.length} direction
                {directions.length > 1 ? "s" : ""}
              </span>
            </div>
  
            {organizationQuery.isLoading && (
              <div className="organization-loading-state">
                <LoaderCircle size={22} className="is-spinning" />
                <span>Chargement de la structure...</span>
              </div>
            )}
  
            {!organizationQuery.isLoading &&
              !organizationQuery.isError &&
              directions.length === 0 && (
                <div className="organization-empty-state">
                  <Building2 size={32} />
  
                  <h4>Aucune structure enregistrée.</h4>
  
                  <p>
                    Commencez par créer une première Direction, puis ajoutez les
                    Services qui lui sont rattachés.
                  </p>
  
                  {canManageOrganization && (
                    <button
                      className="organization-primary-button"
                      type="button"
                      onClick={openCreateDirectionModal}
                    >
                      <Plus size={18} />
                      <span>Créer une Direction</span>
                    </button>
                  )}
                </div>
              )}
  
            <div className="organization-tree">
              {directions.map((direction) => {
                const isExpanded = expandedDirections.includes(direction.id);
                const sortedServices = [...direction.services].sort(
                  (first, second) => {
                    if (first.sortOrder !== second.sortOrder) {
                      return first.sortOrder - second.sortOrder;
                    }
  
                    return first.name.localeCompare(second.name, "fr");
                  },
                );
  
                return (
                  <article
                    key={direction.id}
                    className={`organization-direction-card ${
                      direction.status === "INACTIVE" ? "is-inactive" : ""
                    }`}
                  >
                    <div className="organization-direction-head">
                      <button
                        className="organization-expand-button"
                        type="button"
                        aria-label={
                          isExpanded
                            ? `Réduire ${direction.name}`
                            : `Développer ${direction.name}`
                        }
                        onClick={() => toggleDirection(direction.id)}
                      >
                        {isExpanded ? (
                          <ChevronDown size={19} />
                        ) : (
                          <ChevronRight size={19} />
                        )}
                      </button>
  
                      <span className="organization-unit-avatar direction">
                        {getUnitInitials(direction.name)}
                      </span>
  
                      <div className="organization-unit-main">
                        <div className="organization-unit-title-row">
                          <h4>{direction.name}</h4>
  
                          <span
                            className={`organization-status-badge ${
                              direction.status === "ACTIVE"
                                ? "is-active"
                                : "is-inactive"
                            }`}
                          >
                            {getUnitStatusLabel(direction.status)}
                          </span>
                        </div>
  
                        <p>
                          Code : <strong>{direction.code}</strong>
                          {" · "}
                          {direction.services.length} service
                          {direction.services.length > 1 ? "s" : ""}
                        </p>
                      </div>
  
                      {(canManageOrganization || canDeleteOrganization) && (
                        <div className="organization-unit-actions">
                          {canManageOrganization && (
                            <>
                              <button
                                type="button"
                                title="Modifier cette Direction"
                                onClick={() => openEditModal(direction)}
                              >
                                <Pencil size={16} />
                              </button>

                              <button
                                type="button"
                                title={
                                  direction.status === "ACTIVE"
                                    ? "Désactiver cette Direction"
                                    : "Activer cette Direction"
                                }
                                onClick={() => void toggleUnitStatus(direction)}
                              >
                                {direction.status === "ACTIVE" ? (
                                  <ToggleRight size={19} />
                                ) : (
                                  <ToggleLeft size={19} />
                                )}
                              </button>
                            </>
                          )}

                          {canDeleteOrganization && (
                            <button
                              className="organization-danger-icon-button"
                              type="button"
                              title="Supprimer cette Direction et son arborescence"
                              disabled={deleteMutation.isPending}
                              onClick={() => void deleteUnit(direction)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
  
                    {isExpanded && (
                      <div className="organization-services-list">
                        {direction.description && (
                          <p className="organization-direction-description">
                            {direction.description}
                          </p>
                        )}
  
                        {sortedServices.length === 0 ? (
                          <div className="organization-no-services">
                            <UsersRound size={17} />
                            <span>Aucun Service rattaché à cette Direction.</span>
  
                            {canManageOrganization && (
                              <button
                                type="button"
                                onClick={() =>
                                  openCreateServiceModal(direction.id)
                                }
                              >
                                Ajouter un Service
                              </button>
                            )}
                          </div>
                        ) : (
                          sortedServices.map((service) => (
                            <div
                              key={service.id}
                              className={`organization-service-row ${
                                service.status === "INACTIVE"
                                  ? "is-inactive"
                                  : ""
                              }`}
                            >
                              <span className="organization-service-line" />
  
                              <span className="organization-unit-avatar service">
                                {getUnitInitials(service.name)}
                              </span>
  
                              <div className="organization-unit-main">
                                <div className="organization-unit-title-row">
                                  <h5>{service.name}</h5>
  
                                  <span
                                    className={`organization-status-badge ${
                                      service.status === "ACTIVE"
                                        ? "is-active"
                                        : "is-inactive"
                                    }`}
                                  >
                                    {getUnitStatusLabel(service.status)}
                                  </span>
                                </div>
  
                                <p>
                                  Code : <strong>{service.code}</strong>
                                  {service.description
                                    ? ` · ${service.description}`
                                    : ""}
                                </p>
                              </div>
  
                              {(canManageOrganization || canDeleteOrganization) && (
                                <div className="organization-unit-actions">
                                  {canManageOrganization && (
                                    <>
                                      <button
                                        type="button"
                                        title="Modifier ce Service"
                                        onClick={() => openEditModal(service)}
                                      >
                                        <Pencil size={16} />
                                      </button>

                                      <button
                                        type="button"
                                        title={
                                          service.status === "ACTIVE"
                                            ? "Désactiver ce Service"
                                            : "Activer ce Service"
                                        }
                                        onClick={() =>
                                          void toggleUnitStatus(service)
                                        }
                                      >
                                        {service.status === "ACTIVE" ? (
                                          <ToggleRight size={19} />
                                        ) : (
                                          <ToggleLeft size={19} />
                                        )}
                                      </button>
                                    </>
                                  )}

                                  {canDeleteOrganization && (
                                    <button
                                      className="organization-danger-icon-button"
                                      type="button"
                                      title="Supprimer ce Service"
                                      disabled={deleteMutation.isPending}
                                      onClick={() => void deleteUnit(service)}
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))
                        )}
  
                        {canManageOrganization && (
                          <button
                            className="organization-add-service-button"
                            type="button"
                            onClick={() =>
                              openCreateServiceModal(direction.id)
                            }
                          >
                            <Plus size={16} />
                            <span>Ajouter un Service</span>
                          </button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </article>
  
          <aside className="organization-guide-panel">
            <div className="organization-panel-heading">
              <div>
                <p>LOGIQUE ERP</p>
                <h3>Pourquoi cette étape ?</h3>
              </div>
  
              <FolderTree size={22} />
            </div>
  
            <div className="organization-guide-steps">
              <div>
                <span>01</span>
                <div>
                  <strong>Créer les Directions</strong>
                  <p>
                    Elles représentent les grands pôles de l'Entité.
                  </p>
                </div>
              </div>
  
              <div>
                <span>02</span>
                <div>
                  <strong>Rattacher les Services</strong>
                  <p>
                    Chaque Service dépend d’une Direction active.
                  </p>
                </div>
              </div>
  
              <div>
                <span>03</span>
                <div>
                  <strong>Ajouter les Agents</strong>
                  <p>
                    Les futures fiches agents seront rattachées à cette structure.
                  </p>
                </div>
              </div>
  
              <div>
                <span>04</span>
                <div>
                  <strong>Piloter les activités</strong>
                  <p>
                    Tâches, présence, congés et évaluations utiliseront cette base.
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </section>
  
        {modalMode && (
          <div className="organization-modal-layer" role="presentation">
            <button
              className="organization-modal-backdrop"
              type="button"
              aria-label="Fermer la fenêtre"
              onClick={closeModal}
            />
  
            <section
              className="organization-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="organization-modal-title"
            >
              <header className="organization-modal-header">
                <div>
                  <p>
                    {modalMode === "CREATE_DIRECTION"
                      ? "NOUVELLE DIRECTION"
                      : modalMode === "CREATE_SERVICE"
                        ? "NOUVEAU SERVICE"
                        : "MODIFICATION"}
                  </p>
  
                  <h3 id="organization-modal-title">
                    {modalMode === "CREATE_DIRECTION"
                      ? "Créer une Direction"
                      : modalMode === "CREATE_SERVICE"
                        ? "Créer un Service"
                        : `Modifier ${selectedUnit?.name ?? "la structure"}`}
                  </h3>
                </div>
  
                <button
                  className="organization-modal-close"
                  type="button"
                  aria-label="Fermer"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  <X size={20} />
                </button>
              </header>
  
              {mutationError && (
                <div className="organization-modal-error" role="alert">
                  <CircleAlert size={18} />
                  <span>{mutationError}</span>
                </div>
              )}
  
              <form className="organization-form" onSubmit={handleSubmit}>
                <div className="organization-form-grid">
                  <label className="organization-form-field">
                    <span>Nom de la structure</span>
  
                    <input
                      name="name"
                      value={formState.name}
                      onChange={handleFormChange}
                      placeholder="Ex. Direction Administrative et Financière"
                      disabled={isSubmitting}
                      required
                    />
                  </label>
  
                  <label className="organization-form-field">
                    <span>Code interne</span>
  
                    <input
                      name="code"
                      value={formState.code}
                      onChange={handleFormChange}
                      placeholder="Ex. DAF"
                      maxLength={30}
                      disabled={isSubmitting}
                      required
                    />
                  </label>
  
                  {formState.type === "SERVICE" &&
                    modalMode !== "EDIT" && (
                      <label className="organization-form-field organization-form-field-full">
                        <span>Direction de rattachement</span>
  
                        <select
                          name="parentId"
                          value={formState.parentId}
                          onChange={handleFormChange}
                          disabled={isSubmitting}
                          required
                        >
                          <option value="">
                            Sélectionner une Direction
                          </option>
  
                          {directions
                            .filter(
                              (direction) =>
                                direction.status === "ACTIVE",
                            )
                            .map((direction) => (
                              <option
                                key={direction.id}
                                value={direction.id}
                              >
                                {direction.name} ({direction.code})
                              </option>
                            ))}
                        </select>
                      </label>
                    )}
  
                  <label className="organization-form-field">
                    <span>Statut</span>
  
                    <select
                      name="status"
                      value={formState.status}
                      onChange={handleFormChange}
                      disabled={isSubmitting}
                    >
                      <option value="ACTIVE">Actif</option>
                      <option value="INACTIVE">Inactif</option>
                    </select>
                  </label>
  
                  <label className="organization-form-field">
                    <span>Ordre d’affichage</span>
  
                    <input
                      name="sortOrder"
                      type="number"
                      min="0"
                      max="10000"
                      value={formState.sortOrder}
                      onChange={handleFormChange}
                      disabled={isSubmitting}
                    />
                  </label>
  
                  <label className="organization-form-field organization-form-field-full">
                    <span>Description</span>
  
                    <textarea
                      name="description"
                      value={formState.description}
                      onChange={handleFormChange}
                      placeholder="Mission principale, périmètre ou précisions utiles..."
                      rows={4}
                      disabled={isSubmitting}
                    />
                  </label>
                </div>
  
                <footer className="organization-modal-footer">
                  <button
                    className="organization-cancel-button"
                    type="button"
                    onClick={closeModal}
                    disabled={isSubmitting}
                  >
                    Annuler
                  </button>
  
                  <button
                    className="organization-primary-button"
                    type="submit"
                    disabled={
                      isSubmitting ||
                      !formState.name.trim() ||
                      !formState.code.trim() ||
                      (formState.type === "SERVICE" &&
                        !formState.parentId)
                    }
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle size={18} className="is-spinning" />
                        <span>Enregistrement...</span>
                      </>
                    ) : (
                      <>
                        <Plus size={18} />
                        <span>
                          {modalMode === "EDIT"
                            ? "Enregistrer"
                            : "Créer la structure"}
                        </span>
                      </>
                    )}
                  </button>
                </footer>
              </form>
            </section>
          </div>
        )}
      </section>
    );
  }