// Small reusable "are you sure?" modal -- reuses the same overlay/box shell
// as TradeModal/AuctionModal (.trade-modal-*) rather than a distinct look,
// just narrower (.confirm-modal). Callers own their own open/close state;
// this is purely presentational.
export default function ConfirmDialog({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger, onConfirm, onCancel }) {
  return (
    <div className="trade-modal-overlay" onClick={onCancel}>
      <div className="trade-modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="trade-modal-header">
          <h2>{title}</h2>
        </div>
        <div className="trade-modal-body confirm-modal-body">
          <p>{message}</p>
          <div className="confirm-modal-actions">
            <button onClick={onCancel}>{cancelLabel}</button>
            <button className={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
