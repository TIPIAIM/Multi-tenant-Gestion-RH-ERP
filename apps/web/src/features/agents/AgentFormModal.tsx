import {
    useMemo,
    useState,
    type ChangeEvent,
    type FormEvent,
  } from "react";
  import {
    Building2,
    CalendarDays,
    FileText,
    LoaderCircle,
    UserRound,
    X,
  } from "lucide-react";
  import type { OrganizationTreeDirection } from "../../features/organisation/organisation.types";
  import type {
    Agent,
    AgentContractType,
    AgentEmploymentStatus,
    CreateAgentInput,
  } from "../../features/agents/agent.types";
  
  type AgentFormMode = "CREATE" | "EDIT";
  
  type AgentFormModalProps = {
    mode: AgentFormMode;
    agent?: Agent | null;
    directions: OrganizationTreeDirection[];
    supervisors: Agent[];
    isSubmitting: boolean;
    errorMessage: string | null;
    onClose: () => void;
    onSubmit: (input: CreateAgentInput) => Promise<void>;
  };
  
  type AgentFormState = {
    firstName: string;
    lastName: string;
    matricule: string;
    phone: string;
    email: string;
    address: string;
    jobTitle: string;
    grade: string;
    category: string;
    directionId: string;
    serviceId: string;
    supervisorAgentId: string;
    employmentStatus: AgentEmploymentStatus;
    contractType: AgentContractType;
    employmentStartDate: string;
    employmentEndDate: string;
  };
  
  function getTodayDate(): string {
    const date = new Date();
  
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
  
    return `${year}-${month}-${day}`;
  }
  
  function formatDateInput(value?: string): string {
    return value ? value.slice(0, 10) : "";
  }
  
  function buildFormState(agent?: Agent | null): AgentFormState {
    return {
      firstName: agent?.firstName ?? "",
      lastName: agent?.lastName ?? "",
      matricule: agent?.matricule ?? "",
      phone: agent?.phone ?? "",
      email: agent?.email ?? "",
      address: agent?.address ?? "",
      jobTitle: agent?.jobTitle ?? "",
      grade: agent?.grade ?? "",
      category: agent?.category ?? "",
      directionId: agent?.directionId ?? "",
      serviceId: agent?.serviceId ?? "",
      supervisorAgentId: agent?.supervisorAgentId ?? "",
      employmentStatus: agent?.employmentStatus ?? "ACTIVE",
      contractType: agent?.contractType ?? "PERMANENT",
      employmentStartDate: formatDateInput(
        agent?.employmentStartDate,
      ) || getTodayDate(),
      employmentEndDate: formatDateInput(
        agent?.employmentEndDate,
      ),
    };
  }
  
  const contractLabels: Record<AgentContractType, string> = {
    PERMANENT: "Contrat à durée indéterminée",
    FIXED_TERM: "Contrat à durée déterminée",
    INTERNSHIP: "Stage",
    CONSULTING: "Consultance",
    SECONDMENT: "Mise à disposition",
    OTHER: "Autre statut",
  };
  
  const statusLabels: Record<AgentEmploymentStatus, string> = {
    ACTIVE: "Actif",
    INACTIVE: "Inactif",
    ON_LEAVE: "En congé",
    SUSPENDED: "Suspendu",
    LEFT: "Sorti de l'organisation",
  };
  
  export default function AgentFormModal({
    mode,
    agent,
    directions,
    supervisors,
    isSubmitting,
    errorMessage,
    onClose,
    onSubmit,
  }: AgentFormModalProps) {
    const [formState, setFormState] = useState<AgentFormState>(
      () => buildFormState(agent),
    );
  
    const selectedDirection = useMemo(
      () =>
        directions.find(
          (direction) => direction.id === formState.directionId,
        ),
      [directions, formState.directionId],
    );
  
    const availableServices = selectedDirection?.services.filter(
      (service) =>
        service.status === "ACTIVE" ||
        service.id === formState.serviceId,
    ) ?? [];
  
    function handleChange(
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
  
    function handleDirectionChange(
      event: ChangeEvent<HTMLSelectElement>,
    ): void {
      setFormState((currentValue) => ({
        ...currentValue,
        directionId: event.target.value,
        serviceId: "",
      }));
    }
  
    async function handleSubmit(
      event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
      event.preventDefault();
  
      const payload: CreateAgentInput = {
        firstName: formState.firstName.trim(),
        lastName: formState.lastName.trim(),
        matricule: formState.matricule.trim().toUpperCase(),
  
        phone: formState.phone.trim(),
        email: formState.email.trim() || undefined,
        address: formState.address.trim() || undefined,
  
        jobTitle: formState.jobTitle.trim(),
        grade: formState.grade.trim() || undefined,
        category: formState.category.trim() || undefined,
  
        directionId: formState.directionId,
        serviceId: formState.serviceId || null,
        supervisorAgentId:
          formState.supervisorAgentId || null,
  
        employmentStatus: formState.employmentStatus,
        contractType: formState.contractType,
        employmentStartDate: formState.employmentStartDate,
        employmentEndDate:
          formState.employmentEndDate || undefined,
      };
  
      try {
        await onSubmit(payload);
      } catch {
        // L'erreur API reste affichée dans la modale.
      }
    }
  
    const title =
      mode === "CREATE"
        ? "Créer un agent"
        : `Modifier ${agent?.fullName ?? "l’agent"}`;
  
    return (
      <div className="agent-modal-layer" role="presentation">
        <button
          className="agent-modal-backdrop"
          type="button"
          aria-label="Fermer la fenêtre"
          onClick={onClose}
        />
  
        <section
          className="agent-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="agent-modal-title"
        >
          <header className="agent-modal-header">
            <div>
              <p>
                {mode === "CREATE"
                  ? "NOUVEAU DOSSIER AGENT"
                  : "MISE À JOUR DU DOSSIER"}
              </p>
  
              <h3 id="agent-modal-title">{title}</h3>
            </div>
  
            <button
              className="agent-icon-button"
              type="button"
              aria-label="Fermer"
              onClick={onClose}
              disabled={isSubmitting}
            >
              <X size={20} />
            </button>
          </header>
  
          {errorMessage && (
            <div className="agent-form-error" role="alert">
              <span>{errorMessage}</span>
            </div>
          )}
  
          <form className="agent-form" onSubmit={handleSubmit}>
            <section className="agent-form-section">
              <div className="agent-form-section-heading">
                <UserRound size={18} />
                <div>
                  <strong>Identité et contact</strong>
                  <span>Informations personnelles de l’agent</span>
                </div>
              </div>
  
              <div className="agent-form-grid">
                <label className="agent-form-field">
                  <span>Prénom</span>
                  <input
                    name="firstName"
                    value={formState.firstName}
                    onChange={handleChange}
                    placeholder="Ex. Mamadou"
                    disabled={isSubmitting}
                    required
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Nom</span>
                  <input
                    name="lastName"
                    value={formState.lastName}
                    onChange={handleChange}
                    placeholder="Ex. Diallo"
                    disabled={isSubmitting}
                    required
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Matricule</span>
                  <input
                    name="matricule"
                    value={formState.matricule}
                    onChange={handleChange}
                    placeholder="Ex. nomentreprise-001"
                    maxLength={40}
                    disabled={isSubmitting}
                    required
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Téléphone</span>
                  <input
                    name="phone"
                    type="tel"
                    value={formState.phone}
                    onChange={handleChange}
                    placeholder="+224 620 00 00 00"
                    disabled={isSubmitting}
                    required
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Email professionnel</span>
                  <input
                    name="email"
                    type="email"
                    value={formState.email}
                    onChange={handleChange}
                    placeholder="nom@gn.com"
                    disabled={isSubmitting}
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Catégorie</span>
                  <input
                    name="category"
                    value={formState.category}
                    onChange={handleChange}
                    placeholder="Ex. Personnel administratif"
                    disabled={isSubmitting}
                  />
                </label>
  
                <label className="agent-form-field agent-form-field-full">
                  <span>Adresse</span>
                  <textarea
                    name="address"
                    value={formState.address}
                    onChange={handleChange}
                    placeholder="Ville, quartier ou adresse administrative..."
                    rows={2}
                    disabled={isSubmitting}
                  />
                </label>
              </div>
            </section>
  
            <section className="agent-form-section">
              <div className="agent-form-section-heading">
                <Building2 size={18} />
                <div>
                  <strong>Position et rattachement</strong>
                  <span>Place de l’agent dans la structure </span>
                </div>
              </div>
  
              <div className="agent-form-grid">
                <label className="agent-form-field">
                  <span>Poste occupé</span>
                  <input
                    name="jobTitle"
                    value={formState.jobTitle}
                    onChange={handleChange}
                    placeholder="Ex. Chargé des Ressources Humaines"
                    disabled={isSubmitting}
                    required
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Grade</span>
                  <input
                    name="grade"
                    value={formState.grade}
                    onChange={handleChange}
                    placeholder="Ex. Cadre"
                    disabled={isSubmitting}
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Direction</span>
                  <select
                    name="directionId"
                    value={formState.directionId}
                    onChange={handleDirectionChange}
                    disabled={isSubmitting}
                    required
                  >
                    <option value="">
                      Sélectionner une Direction
                    </option>
  
                    {directions
                      .filter(
                        (direction) =>
                          direction.status === "ACTIVE" ||
                          direction.id === formState.directionId,
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
  
                <label className="agent-form-field">
                  <span>Service</span>
                  <select
                    name="serviceId"
                    value={formState.serviceId}
                    onChange={handleChange}
                    disabled={
                      isSubmitting || !formState.directionId
                    }
                  >
                    <option value="">
                      Aucun service précisé
                    </option>
  
                    {availableServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.code})
                      </option>
                    ))}
                  </select>
                </label>
  
                <label className="agent-form-field agent-form-field-full">
                  <span>Supérieur hiérarchique</span>
                  <select
                    name="supervisorAgentId"
                    value={formState.supervisorAgentId}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  >
                    <option value="">
                      Aucun supérieur hiérarchique
                    </option>
  
                    {supervisors
                      .filter(
                        (supervisor) =>
                          supervisor.id !== agent?.id,
                      )
                      .map((supervisor) => (
                        <option
                          key={supervisor.id}
                          value={supervisor.id}
                        >
                          {supervisor.fullName} · {supervisor.jobTitle}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </section>
  
            <section className="agent-form-section">
              <div className="agent-form-section-heading">
                <CalendarDays size={18} />
                <div>
                  <strong>Situation administrative</strong>
                  <span>Contrat, statut et période d’activité</span>
                </div>
              </div>
  
              <div className="agent-form-grid">
                <label className="agent-form-field">
                  <span>Statut</span>
                  <select
                    name="employmentStatus"
                    value={formState.employmentStatus}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  >
                    {Object.entries(statusLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
  
                <label className="agent-form-field">
                  <span>Type de contrat</span>
                  <select
                    name="contractType"
                    value={formState.contractType}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  >
                    {Object.entries(contractLabels).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
  
                <label className="agent-form-field">
                  <span>Date de prise de fonction</span>
                  <input
                    name="employmentStartDate"
                    type="date"
                    value={formState.employmentStartDate}
                    onChange={handleChange}
                    disabled={isSubmitting}
                    required
                  />
                </label>
  
                <label className="agent-form-field">
                  <span>Date de fin éventuelle</span>
                  <input
                    name="employmentEndDate"
                    type="date"
                    min={formState.employmentStartDate}
                    value={formState.employmentEndDate}
                    onChange={handleChange}
                    disabled={isSubmitting}
                  />
                </label>
              </div>
            </section>
  
            <div className="agent-form-note">
              <FileText size={17} />
              <span>
                Les documents RH seront ajoutés dans le prochain sous-module
                de stockage sécurisé.
              </span>
            </div>
  
            <footer className="agent-modal-footer">
              <button
                className="agent-cancel-button"
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Annuler
              </button>
  
              <button
                className="agent-primary-button"
                type="submit"
                disabled={
                  isSubmitting ||
                  !formState.firstName.trim() ||
                  !formState.lastName.trim() ||
                  !formState.matricule.trim() ||
                  !formState.phone.trim() ||
                  !formState.jobTitle.trim() ||
                  !formState.directionId
                }
              >
                {isSubmitting ? (
                  <>
                    <LoaderCircle
                      size={18}
                      className="is-spinning"
                    />
                    <span>Enregistrement...</span>
                  </>
                ) : (
                  <span>
                    {mode === "CREATE"
                      ? "Créer le dossier"
                      : "Enregistrer les modifications"}
                  </span>
                )}
              </button>
            </footer>
          </form>
        </section>
      </div>
    );
  }