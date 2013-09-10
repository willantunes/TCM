package model;

import java.sql.Date;

public class FreqProfessor {

	private int professor_id;
	private int disciplina_id;
	private Date presenca;
	private String justificativa;
	
	public int getProfessor_id() {
		return professor_id;
	}
	public void setProfessor_id(int professor_id) {
		this.professor_id = professor_id;
	}
	public int getDisciplina_id() {
		return disciplina_id;
	}
	public void setDisciplina_id(int disciplina_id) {
		this.disciplina_id = disciplina_id;
	}
	public Date getPresenca() {
		return presenca;
	}
	public void setPresenca(Date presenca) {
		this.presenca = presenca;
	}
	public String getJustificativa() {
		return justificativa;
	}
	public void setJustificativa(String justificativa) {
		this.justificativa = justificativa;
	}
}
