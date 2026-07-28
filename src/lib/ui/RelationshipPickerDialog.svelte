<script lang="ts">
  import type { RelationshipTypeName } from '../metamodel/RelationshipsMatrix';
  import { RelationshipsMatrix } from '../metamodel/RelationshipsMatrix';
  import { formatTypeName } from '../canvas/archi-styles';
  import { X } from '@lucide/svelte';

  export type RelChoice = {
    relationshipType: RelationshipTypeName;
    direction?: 'parent-to-child' | 'child-to-parent' | 'source-to-target';
    label?: string;
  };

  interface Props {
    open: boolean;
    title?: string;
    subtitle?: string;
    sourceName: string;
    sourceType: string;
    targetName: string;
    targetType: string;
    choices: RelChoice[];
    /** Extra primary actions (e.g. nest without relation, place free) */
    allowSkip?: boolean;
    skipLabel?: string;
    cancelLabel?: string;
    onselect: (choice: RelChoice) => void;
    onskip?: () => void;
    oncancel: () => void;
  }

  let {
    open,
    title = 'Choose relationship',
    subtitle = 'Allowed by the ArchiMate metamodel',
    sourceName,
    sourceType,
    targetName,
    targetType,
    choices,
    allowSkip = false,
    skipLabel = 'No relationship',
    cancelLabel = 'Cancel',
    onselect,
    onskip,
    oncancel,
  }: Props = $props();

  function choiceLabel(c: RelChoice): string {
    if (c.label) return c.label;
    const name = RelationshipsMatrix.label(c.relationshipType);
    if (c.direction === 'child-to-parent') {
      return `${name}  (← reverse: child → parent)`;
    }
    if (c.direction === 'parent-to-child') {
      return `${name}  (parent → child)`;
    }
    return name;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="dlg-backdrop" onclick={oncancel} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions a11y_no_noninteractive_element_interactions -->
    <div
      class="dlg"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="rel-dlg-title"
      onclick={(e) => e.stopPropagation()}
    >
      <header class="dlg-header">
        <div>
          <h2 id="rel-dlg-title">{title}</h2>
          <p class="dlg-sub">{subtitle}</p>
        </div>
        <button type="button" class="dlg-close" onclick={oncancel} title="Close">
          <X size={16} />
        </button>
      </header>

      <div class="dlg-pair">
        <div class="dlg-concept">
          <span class="dlg-concept-role">Source</span>
          <span class="dlg-concept-name">{sourceName}</span>
          <span class="dlg-concept-type">{formatTypeName(sourceType)}</span>
        </div>
        <div class="dlg-arrow">→</div>
        <div class="dlg-concept">
          <span class="dlg-concept-role">Target</span>
          <span class="dlg-concept-name">{targetName}</span>
          <span class="dlg-concept-type">{formatTypeName(targetType)}</span>
        </div>
      </div>

      {#if choices.length === 0}
        <div class="dlg-empty">
          No ArchiMate relationships are allowed between these concept types.
        </div>
      {:else}
        <ul class="dlg-list">
          {#each choices as c}
            <li>
              <button type="button" class="dlg-choice" onclick={() => onselect(c)}>
                <span class="dlg-choice-name">{choiceLabel(c)}</span>
                <span class="dlg-choice-code">{c.relationshipType.replace(/Relationship$/, '')}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      <footer class="dlg-footer">
        {#if allowSkip && onskip}
          <button type="button" class="btn" onclick={onskip}>{skipLabel}</button>
        {/if}
        <button type="button" class="btn" onclick={oncancel}>{cancelLabel}</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .dlg-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    backdrop-filter: blur(2px);
  }
  .dlg {
    width: min(480px, 100%);
    max-height: min(80vh, 640px);
    background: var(--bg-surface, #161b25);
    border: 1px solid var(--border-default, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .dlg-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px 16px 12px;
    border-bottom: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.06));
  }
  .dlg-header h2 {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary, #e8eaf0);
    margin: 0;
  }
  .dlg-sub {
    font-size: 11px;
    color: var(--text-muted, #4a5568);
    margin: 4px 0 0;
  }
  .dlg-close {
    margin-left: auto;
    background: transparent;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
  }
  .dlg-close:hover {
    background: var(--bg-hover, #242b3d);
    color: var(--text-primary);
  }
  .dlg-pair {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 16px;
    background: var(--bg-elevated, #1d2332);
  }
  .dlg-concept {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .dlg-concept-role {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
  }
  .dlg-concept-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dlg-concept-type {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--text-secondary, #8892a4);
  }
  .dlg-arrow {
    color: var(--accent-blue, #4d8ef0);
    font-size: 18px;
    flex-shrink: 0;
  }
  .dlg-list {
    list-style: none;
    margin: 0;
    padding: 8px;
    overflow-y: auto;
    flex: 1;
  }
  .dlg-choice {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    color: var(--text-secondary);
    font-family: inherit;
  }
  .dlg-choice:hover {
    background: var(--bg-hover, #242b3d);
    border-color: var(--border-default);
    color: var(--text-primary);
  }
  .dlg-choice-name {
    flex: 1;
    font-size: 13px;
    font-weight: 500;
  }
  .dlg-choice-code {
    font-size: 10px;
    font-family: var(--font-mono, monospace);
    color: var(--text-muted);
  }
  .dlg-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--accent-orange, #f59e0b);
    font-size: 12px;
  }
  .dlg-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border-subtle);
  }
  .btn {
    padding: 6px 12px;
    font-size: 12px;
    font-family: inherit;
    background: var(--bg-elevated);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
