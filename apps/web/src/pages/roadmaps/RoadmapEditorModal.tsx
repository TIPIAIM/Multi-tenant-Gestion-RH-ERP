import {
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  FileText,
  Layers3,
  LoaderCircle,
  Plus,
  Target,
  Trash2,
  X,
} from "lucide-react";
import type {
  CreateRoadmapInput,
  Roadmap,
  RoadmapItemInput,
  UpdateRoadmapInput,
} from "../../features/roadmaps/roadmap.types";

type RoadmapEditorModalProps = {
  roadmap?: Roadmap | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (
    input: CreateRoadmapInput | UpdateRoadmapInput,
    submit: boolean,
  ) => Promise<void>;
};

type RoadmapItemForm = RoadmapItemInput & {
  localId: string;
};

type RoadmapFormState = {
  calendarYear: string;
  title: string;
  overview: string;
  items: RoadmapItemForm[];
};

function createEmptyItem(): RoadmapItemForm {
  return {
    localId:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    title: "",
    description: "",
    kpiLabel: "",
    plannedPeriod: "",
    dueDate: "",
  };
}

function formatDateInput(value?: string): string {
  return value ? value.slice(0, 10) : "";
}

function buildInitialState(roadmap?: Roadmap | null): RoadmapFormState {
  return {
    calendarYear: String(
      roadmap?.calendarYear ?? new Date().getFullYear(),
    ),
    title:
      roadmap?.title ??
      `Feuille de route annuelle ${new Date().getFullYear()}`,
    overview: roadmap?.overview ?? "",
    items:
      roadmap?.items?.length
        ? roadmap.items.map((item) => ({
            localId: item.id,
            title: item.title,
            description: item.description ?? "",
            kpiLabel: item.kpiLabel,
            plannedPeriod: item.plannedPeriod ?? "",
            dueDate: formatDateInput(item.dueDate),
          }))
        : [createEmptyItem()],
  };
}

function sanitizeItems(items: RoadmapItemForm[]): RoadmapItemInput[] {
  return items
    .map((item) => ({
      title: item.title.trim(),
      description: item.description?.trim() || undefined,
      kpiLabel: item.kpiLabel.trim(),
      plannedPeriod: item.plannedPeriod?.trim() || undefined,
      dueDate: item.dueDate || undefined,
    }))
    .filter(
      (item) =>
        item.title ||
        item.description ||
        item.kpiLabel ||
        item.plannedPeriod ||
        item.dueDate,
    );
}

export default function RoadmapEditorModal({
  roadmap,
  isSubmitting,
  errorMessage,
  onClose,
  onSave,
}: RoadmapEditorModalProps) {
  const [formState, setFormState] = useState<RoadmapFormState>(
    () => buildInitialState(roadmap),
  );

  const [clientError, setClientError] = useState<string | null>(
    null,
  );

  const sanitizedItems = useMemo(
    () => sanitizeItems(formState.items),
    [formState.items],
  );

  const validItemCount = sanitizedItems.filter(
    (item) => item.title.length >= 3 && item.kpiLabel.length >= 2,
  ).length;

  const canSubmit =
    !isSubmitting &&
    formState.title.trim().length >= 5 &&
    Number(formState.calendarYear) >= 2020 &&
    Number(formState.calendarYear) <= 2200 &&
    validItemCount >= 1 &&
    validItemCount === sanitizedItems.length;

  function updateField(
    key: keyof Omit<RoadmapFormState, "items">,
    value: string,
  ): void {
    setFormState((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateItem(
    localId: string,
    key: keyof RoadmapItemInput,
    value: string,
  ): void {
    setFormState((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.localId === localId
          ? {
              ...item,
              [key]: value,
            }
          : item,
      ),
    }));
  }

  function addItem(): void {
    setFormState((current) => ({
      ...current,
      items: [...current.items, createEmptyItem()],
    }));
  }

  function removeItem(localId: string): void {
    setFormState((current) => ({
      ...current,
      items:
        current.items.length <= 1
          ? [createEmptyItem()]
          : current.items.filter((item) => item.localId !== localId),
    }));
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
    shouldSubmit: boolean,
  ): Promise<void> {
    event.preventDefault();
    setClientError(null);

    const items = sanitizeItems(formState.items);

    if (formState.title.trim().length < 5) {
      setClientError(
        "L’intitulé de la feuille de route doit contenir au moins 5 caractères.",
      );
      return;
    }

    if (!items.length) {
      setClientError(
        "Ajoutez au moins une ligne avec une action et un KPI attendu.",
      );
      return;
    }

    const invalidItem = items.find(
      (item) => item.title.length < 3 || item.kpiLabel.length < 2,
    );

    if (invalidItem) {
      setClientError(
        "Chaque ligne conservée doit avoir une action d’au moins 3 caractères et un KPI d’au moins 2 caractères.",
      );
      return;
    }

    const baseInput = {
      title: formState.title.trim(),
      overview: formState.overview.trim() || undefined,
      items,
    };

    try {
      await onSave(
        roadmap
          ? baseInput
          : {
              ...baseInput,
              calendarYear: Number(formState.calendarYear),
            },
        shouldSubmit,
      );
    } catch {
      // L’erreur API est affichée par la page.
    }
  }

  const displayedError = clientError ?? errorMessage;

  return (
    <div className="roadmap-modal-layer" role="presentation">
      <button
        className="roadmap-modal-backdrop"
        type="button"
        aria-label="Fermer la fenêtre"
        onClick={onClose}
      />

      <section
        className="roadmap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="roadmap-editor-title"
      >
        <header className="roadmap-modal-header">
          <div>
            <p>
              {roadmap ? "MISE À JOUR DU PLAN" : "NOUVELLE FEUILLE"}
            </p>
            <h3 id="roadmap-editor-title">
              {roadmap
                ? `Modifier ${roadmap.reference}`
                : "Créer une feuille de route annuelle"}
            </h3>
          </div>

          <button
            className="roadmap-icon-button"
            type="button"
            aria-label="Fermer"
            onClick={onClose}
            disabled={isSubmitting}
          >
            <X size={20} />
          </button>
        </header>

        {displayedError && (
          <div className="roadmap-form-error" role="alert">
            <span>{displayedError}</span>
          </div>
        )}

        <form className="roadmap-form" onSubmit={(event) => void submitForm(event, false)}>
          <section className="roadmap-form-section">
            <div className="roadmap-form-section-heading">
              <FileText size={18} />
              <div>
                <strong>Identité de la feuille</strong>
                <span>
                  Le plan est automatiquement rattaché au compte connecté.
                </span>
              </div>
            </div>

            <div className="roadmap-form-grid">
              <label className="roadmap-form-field">
                <span>Année</span>
                <input
                  type="number"
                  min={2020}
                  max={2200}
                  value={formState.calendarYear}
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    updateField("calendarYear", event.target.value)
                  }
                  disabled={Boolean(roadmap) || isSubmitting}
                  required
                />
              </label>

              <label className="roadmap-form-field roadmap-form-field-wide">
                <span>Intitulé</span>
                <input
                  value={formState.title}
                  onChange={(event) =>
                    updateField("title", event.target.value)
                  }
                  placeholder="Ex. Feuille de route annuelle Direction des opérations"
                  disabled={isSubmitting}
                  required
                />
              </label>

              <label className="roadmap-form-field roadmap-form-field-full">
                <span>Présentation générale</span>
                <textarea
                  rows={3}
                  value={formState.overview}
                  onChange={(event) =>
                    updateField("overview", event.target.value)
                  }
                  placeholder="Objectifs principaux, priorités stratégiques et contexte de l’année..."
                  disabled={isSubmitting}
                />
              </label>
            </div>
          </section>

          <section className="roadmap-form-section">
            <div className="roadmap-form-section-heading roadmap-form-section-heading-inline">
              <div>
                <Layers3 size={18} />
                <div>
                  <strong>Lignes d’objectifs</strong>
                  <span>
                    Chaque action doit avoir son KPI attendu. Les lignes vides ne sont pas envoyées.
                  </span>
                </div>
              </div>

              <button
                className="roadmap-add-line-button"
                type="button"
                onClick={addItem}
                disabled={isSubmitting}
              >
                <Plus size={16} />
                <span>Ajouter une ligne</span>
              </button>
            </div>

            <div className="roadmap-lines-list">
              {formState.items.map((item, index) => (
                <article className="roadmap-line-card" key={item.localId}>
                  <header>
                    <span>Ligne {index + 1}</span>

                    <button
                      type="button"
                      aria-label="Supprimer la ligne"
                      onClick={() => removeItem(item.localId)}
                      disabled={isSubmitting}
                    >
                      <Trash2 size={16} />
                    </button>
                  </header>

                  <div className="roadmap-line-grid">
                    <label className="roadmap-form-field roadmap-form-field-full">
                      <span>Action / objectif</span>
                      <input
                        value={item.title}
                        onChange={(event) =>
                          updateItem(item.localId, "title", event.target.value)
                        }
                        placeholder="Ex. Mettre à jour le référentiel des agents"
                        disabled={isSubmitting}
                      />
                    </label>

                    <label className="roadmap-form-field roadmap-form-field-full">
                      <span>KPI attendu</span>
                      <input
                        value={item.kpiLabel}
                        onChange={(event) =>
                          updateItem(item.localId, "kpiLabel", event.target.value)
                        }
                        placeholder="Ex. Référentiel validé et publié"
                        disabled={isSubmitting}
                      />
                    </label>

                    <label className="roadmap-form-field">
                      <span>Période prévue</span>
                      <input
                        value={item.plannedPeriod ?? ""}
                        onChange={(event) =>
                          updateItem(item.localId, "plannedPeriod", event.target.value)
                        }
                        placeholder="Ex. T1 / Janvier-Mars"
                        disabled={isSubmitting}
                      />
                    </label>

                    <label className="roadmap-form-field">
                      <span>Échéance</span>
                      <input
                        type="date"
                        value={item.dueDate ?? ""}
                        onChange={(event) =>
                          updateItem(item.localId, "dueDate", event.target.value)
                        }
                        disabled={isSubmitting}
                      />
                    </label>

                    <label className="roadmap-form-field roadmap-form-field-full">
                      <span>Description facultative</span>
                      <textarea
                        rows={2}
                        value={item.description ?? ""}
                        onChange={(event) =>
                          updateItem(item.localId, "description", event.target.value)
                        }
                        placeholder="Précisez le livrable, la méthode ou le résultat attendu..."
                        disabled={isSubmitting}
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <div className="roadmap-form-note">
            <Target size={17} />
            <span>
              Le système calcule automatiquement la progression selon les lignes réalisées.
              Aucun pourcentage n’est saisi manuellement.
            </span>
          </div>

          <footer className="roadmap-modal-footer">
            <button
              className="roadmap-cancel-button"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Annuler
            </button>

            <button
              className="roadmap-secondary-action"
              type="submit"
              disabled={!canSubmit}
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle size={17} className="is-spinning" />
                  <span>Enregistrement...</span>
                </>
              ) : (
                <span>Enregistrer</span>
              )}
            </button>

            <button
              className="roadmap-primary-button"
              type="button"
              disabled={!canSubmit}
              onClick={() => {
                const fakeEvent = {
                  preventDefault() {},
                } as FormEvent<HTMLFormElement>;

                void submitForm(fakeEvent, true);
              }}
            >
              <CalendarDays size={17} />
              <span>Enregistrer et soumettre</span>
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
