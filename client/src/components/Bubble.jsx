import React from "react";
import { useState } from "react";
import exit from "../assets/images/exit.png";
import exithover from "../assets/images/exithover.png";
function Bubble({ content, deleteBubble }) {
	const [source, setSource] = useState(exit);
	if (content.release_id === 169) console.log(content);
	return (
		<div className="bubble">
			<span>
				{content.release_number} | {content.release_count}{" "}
			</span>
			<button
				className="bubbleBtn"
				onClick={() => deleteBubble(content)}
				onMouseOver={() => setSource(exithover)}
				onMouseLeave={() => setSource(exit)}
			>
				<img src={source} width="10px" alt="X"></img>
			</button>
		</div>
	);
}

export default Bubble;
