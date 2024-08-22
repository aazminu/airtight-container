import React from 'react'
function SearchContainers({search}) {
  const changedSearch = (e) => {
    search(e.target.value)
  }
  return (
    <div className="searchContainer">
      <input type="text" className="searchBar" placeholder="Search..." onChange={changedSearch}></input>
    </div>
  )
}

export default SearchContainers
