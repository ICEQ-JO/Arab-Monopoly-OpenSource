import "./propertyCardDetail.css";
import { IconTrash } from "./icons";

// Title-deed card for a station ("محطة كوستر") tile -- same vintage-parchment
// visual language as PropertyCardDetail (in fact reuses its stylesheet), but
// laid out like the real Monopoly railroad card: a flat rent list keyed by
// how many stations the owner holds (not house tiers), no build/sell
// controls since stations don't take houses. Rent-tier count is read off
// `tile.rent.length` rather than hardcoded to 6, so the same card also works
// on the eu/middle-east boards' 4-station sets.
export default function TransitCardDetail({
  tile,
  mortgaged = false,
  owner,
  ownedCount = 0,
  onMortgage,
  canMortgage = false,
  showActions = true,
  showOwner = true,
  error,
}) {
  const mortgageValue = Math.floor(tile.price / 2);
  const [baseRent, ...tieredRent] = tile.rent;
  const totalStations = tile.rent.length;

  return (
    <div className={`pcard-detail pcard-detail--transit${mortgaged ? " pcard-detail--mortgaged" : ""}`}>
      <div className="pcard-detail-band pcard-detail-band--transit">
        <span className="pcard-detail-band-label">Title Deed</span>
      </div>
      <div className="pcard-detail-body">
        <img src="/bus.svg" className="pcard-detail-transit-icon" alt="" />
        <h3 className="pcard-detail-name">{tile.name}</h3>
        <div className="pcard-detail-rule" />
        <p className="pcard-detail-rent-base">Rent <strong className="pcard-detail-value">${baseRent}</strong></p>
        <ul className="pcard-detail-rent-list">
          {tieredRent.map((rent, i) => (
            <li
              key={i}
              className={`pcard-detail-rent-row${ownedCount === i + 2 ? " current" : ""}`}
            >
              <span>If {i + 2} Stations Owned</span>
              <span className="pcard-detail-value">${rent}</span>
            </li>
          ))}
        </ul>
        <div className="pcard-detail-rule pcard-detail-rule--thin" />
        <p className="pcard-detail-footnote">Mortgage Value <strong className="pcard-detail-value">${mortgageValue}</strong></p>
        <p className="pcard-detail-footnote">{totalStations} stations on this board</p>

        {((showOwner && owner) || showActions) && <div className="pcard-detail-rule pcard-detail-rule--thin" />}

        {showOwner && owner && (
          <div className="pcard-detail-owner-row">
            {owner.iconImg && (
              <img
                className="pcard-detail-owner-avatar"
                src={owner.iconImg}
                alt=""
                style={{ "--owner-ring": owner.color }}
              />
            )}
            <span className="pcard-detail-owner-name">{owner.name}</span>
          </div>
        )}

        {showActions && (
          <div className="pcard-detail-actions">
            <button
              className="pcard-detail-action-btn pcard-detail-action-btn--danger"
              onClick={onMortgage}
              disabled={!canMortgage}
              title={mortgaged ? "Pay off mortgage" : "Mortgage station"}
              aria-label={mortgaged ? "Pay off mortgage" : "Mortgage station"}
            >
              <IconTrash />
            </button>
          </div>
        )}

        {error && <p className="pcard-detail-error">{error}</p>}
      </div>
      {mortgaged && <div className="pcard-detail-mortgaged-stamp">Mortgaged</div>}
    </div>
  );
}
