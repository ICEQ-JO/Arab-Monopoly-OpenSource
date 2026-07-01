import "./propertyCardDetail.css";
import { IconArrowUp, IconArrowDown, IconTrash } from "./icons";

const HOUSE_LABELS = ["1 House", "2 Houses", "3 Houses", "4 Houses"];

// Expanded title-deed card for the board's tile-click popup. Same visual
// language as PropertyCard, plus the owner row and build/sell/mortgage
// controls -- kept in its own component/stylesheet (propertyCardDetail.css)
// so the plain PropertyCard used in lists/trade stays untouched.
export default function PropertyCardDetail({
  tile,
  houses = 0,
  mortgaged = false,
  owner,
  onBuildHouse,
  onSellHouse,
  onMortgage,
  canBuildHouse = false,
  canSellHouse = false,
  canMortgage = false,
  error,
}) {
  const mortgageValue = Math.floor(tile.price / 2);
  const [baseRent, ...houseRents] = tile.rent;
  const hotelRent = tile.rent[5];

  return (
    <div className={`pcard-detail${mortgaged ? " pcard-detail--mortgaged" : ""}`}>
      <div className="pcard-detail-band" style={{ background: tile.groupColor || "#888" }}>
        <span className="pcard-detail-band-label">Title Deed</span>
      </div>
      <div className="pcard-detail-body">
        <h3 className="pcard-detail-name">{tile.name}</h3>
        <div className="pcard-detail-rule" />
        <p className="pcard-detail-rent-base">Rent ${baseRent}</p>
        <ul className="pcard-detail-rent-list">
          {houseRents.slice(0, 4).map((rent, i) => (
            <li key={i} className={`pcard-detail-rent-row${houses === i + 1 ? " current" : ""}`}>
              <span>With {HOUSE_LABELS[i]}</span>
              <span>${rent}</span>
            </li>
          ))}
        </ul>
        <p className={`pcard-detail-hotel-row${houses >= 5 ? " current" : ""}`}>
          <span>With Hotel</span>
          <span>${hotelRent}</span>
        </p>
        <div className="pcard-detail-rule pcard-detail-rule--thin" />
        <p className="pcard-detail-footnote">Mortgage Value ${mortgageValue}</p>
        <p className="pcard-detail-footnote">Houses cost ${tile.housePrice} each</p>
        <p className="pcard-detail-footnote">Hotels, ${tile.housePrice} plus 4 houses</p>

        {owner && (
          <>
            <div className="pcard-detail-rule pcard-detail-rule--thin" />
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

            <div className="pcard-detail-actions">
              <button
                className="pcard-detail-action-btn"
                onClick={onBuildHouse}
                disabled={!canBuildHouse}
                title="Build a house"
                aria-label="Build a house"
              >
                <IconArrowUp />
              </button>
              <button
                className="pcard-detail-action-btn"
                onClick={onSellHouse}
                disabled={!canSellHouse}
                title="Sell a house"
                aria-label="Sell a house"
              >
                <IconArrowDown />
              </button>
              <button
                className="pcard-detail-action-btn pcard-detail-action-btn--danger"
                onClick={onMortgage}
                disabled={!canMortgage}
                title={mortgaged ? "Pay off mortgage" : "Mortgage property"}
                aria-label={mortgaged ? "Pay off mortgage" : "Mortgage property"}
              >
                <IconTrash />
              </button>
            </div>
          </>
        )}

        {error && <p className="pcard-detail-error">{error}</p>}
      </div>
      {mortgaged && <div className="pcard-detail-mortgaged-stamp">Mortgaged</div>}
    </div>
  );
}
